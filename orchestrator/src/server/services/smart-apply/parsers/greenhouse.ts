/**
 * Greenhouse apply form parser.
 *
 * Strategy: use Playwright to render the apply page (some Greenhouse boards
 * lazy-load the form via JS), then walk the DOM to extract a stable
 * FormSchema.  We deliberately use the *same* Page object later in
 * session.ts so we don't pay the cost of a second page load.
 *
 * Greenhouse standard form layout:
 *   - Top-level form id = "application-form" or class="application-form"
 *   - Fields wrapped in `<div class="field">` or `<fieldset>`
 *   - Inputs: <input id="first_name">, <input id="last_name">, etc.
 *   - Resume: <input type="file" id="resume" name="job_application[resume]">
 *   - Cover letter: similar (optional)
 *   - Custom questions: <div class="field"><label>Q text<input/textarea/select></label></div>
 *
 * Greenhouse also has an "embed" iframe variant for older job boards
 * (`boards.greenhouse.io/embed/job_app?token=…`) — same DOM though, so the
 * parser works on the form inside the iframe as long as Playwright can
 * frame-hop.
 */

import type { Frame, Page } from "playwright";
import {
  type FormField,
  type FormFieldType,
  type FormSchema,
} from "../types";

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[* ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectCaptcha(html: string): boolean {
  const lc = html.toLowerCase();
  return (
    lc.includes("g-recaptcha") ||
    lc.includes("h-captcha") ||
    lc.includes("turnstile") ||
    lc.includes("recaptcha/api.js")
  );
}

/**
 * Some Greenhouse jobs publish the application form on the same page as the
 * job description, others redirect to a dedicated /apply route, and a few
 * still embed it in an iframe.  This finds the frame that actually contains
 * the form so the rest of the parser can work uniformly.
 */
async function findFormFrame(page: Page): Promise<Frame | null> {
  // Try main frame first.
  const main = page.mainFrame();
  if ((await main.$$("form#application-form, form.application-form, [data-mapped='application_form']")).length > 0) {
    return main;
  }
  for (const frame of page.frames()) {
    if (frame === main) continue;
    if (!frame.url().includes("greenhouse.io")) continue;
    if ((await frame.$$("form#application-form, form.application-form")).length > 0) {
      return frame;
    }
  }
  return null;
}

function inputTypeOf(rawType: string | null | undefined): FormFieldType {
  switch ((rawType ?? "text").toLowerCase()) {
    case "email":
      return "email";
    case "tel":
    case "phone":
      return "tel";
    case "url":
      return "url";
    case "file":
      return "file";
    case "checkbox":
      return "checkbox";
    case "radio":
      return "radio";
    default:
      return "text";
  }
}

/**
 * Walk every form field in the frame and produce a FormField[].  Only
 * captures fields that have a stable selector — anonymous inputs without
 * id/name attributes are skipped (rare on Greenhouse).
 */
async function extractFields(frame: Frame): Promise<FormField[]> {
  // Use evaluate to bulk-extract in one round-trip — much faster than a
  // selector per field.  The browser side returns plain JSON.
  const rawFields = await frame.evaluate(() => {
    const collected: Array<{
      selector: string;
      label: string;
      tag: string;
      inputType: string | null;
      required: boolean;
      options?: Array<{ value: string; label: string }>;
      accept?: string;
      hint?: string;
    }> = [];

    const visited = new Set<Element>();

    function cssEscape(value: string): string {
      // Subset of CSS.escape — Greenhouse ids are alphanumeric + brackets.
      return value.replace(/([!"#$%&'()*+,./:;<=>?@\[\\\]^`{|}~ ])/g, "\\$1");
    }

    function buildSelector(el: Element): string | null {
      const id = el.getAttribute("id");
      if (id) return `#${cssEscape(id)}`;
      const name = el.getAttribute("name");
      if (name) return `${el.tagName.toLowerCase()}[name="${name.replace(/"/g, '\\"')}"]`;
      return null;
    }

    function findLabel(el: Element): string {
      // 1. <label for="id">
      const id = el.getAttribute("id");
      if (id) {
        const lab = document.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`);
        if (lab?.textContent) return lab.textContent.trim();
      }
      // 2. Ancestor <label>
      let cur: Element | null = el;
      while (cur && cur !== document.body) {
        if (cur.tagName === "LABEL" && cur.textContent) {
          return cur.textContent.trim();
        }
        cur = cur.parentElement;
      }
      // 3. Previous sibling label-ish element.
      const prev = el.previousElementSibling;
      if (prev && prev.textContent) return prev.textContent.trim();
      // 4. aria-label fallback.
      const aria = el.getAttribute("aria-label");
      if (aria) return aria.trim();
      // 5. placeholder fallback.
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) return placeholder.trim();
      return "";
    }

    const inputs = document.querySelectorAll(
      "form input, form textarea, form select",
    );

    for (const input of Array.from(inputs)) {
      if (visited.has(input)) continue;
      visited.add(input);
      const tag = input.tagName.toLowerCase();
      const type =
        tag === "input" ? input.getAttribute("type") ?? "text" : tag;
      if (type === "hidden" || type === "submit" || type === "button") continue;

      const selector = buildSelector(input);
      if (!selector) continue;

      const label = findLabel(input);
      const required =
        input.hasAttribute("required") ||
        input.getAttribute("aria-required") === "true";

      const field: (typeof collected)[number] = {
        selector,
        label,
        tag,
        inputType: tag === "select" ? "select" : type,
        required,
      };

      if (tag === "select") {
        const opts = (input as HTMLSelectElement).options;
        field.options = Array.from(opts)
          .filter((opt) => !!opt.value)
          .map((opt) => ({ value: opt.value, label: opt.text.trim() }));
      }

      if (type === "file") {
        field.accept = input.getAttribute("accept") ?? undefined;
      }

      const hintEl =
        input.parentElement?.querySelector(".help, .form-hint, .hint") ??
        input.parentElement?.querySelector("small");
      if (hintEl?.textContent) {
        field.hint = hintEl.textContent.trim();
      }

      collected.push(field);
    }

    return collected;
  });

  // Coalesce radios with the same `name` into a single "choice" field.
  const radioGroups = new Map<string, FormField>();
  const fields: FormField[] = [];

  for (const raw of rawFields) {
    const type = inputTypeOf(raw.inputType);
    const label = raw.label || "";
    const normalizedLabel = normalizeLabel(label);

    if (type === "radio") {
      // Extract `name` from selector or treat selector as the group key.
      const nameMatch = raw.selector.match(/name="([^"]+)"/);
      const groupKey = nameMatch?.[1] ?? raw.selector;
      const existing = radioGroups.get(groupKey);
      if (existing) {
        existing.options ??= [];
        existing.options.push({ value: raw.selector, label });
        continue;
      }
      const field: FormField = {
        selector: nameMatch ? `[name="${nameMatch[1]}"]` : raw.selector,
        label,
        normalizedLabel,
        type: "radio",
        required: raw.required,
        options: [{ value: raw.selector, label }],
        hint: raw.hint,
      };
      radioGroups.set(groupKey, field);
      fields.push(field);
      continue;
    }

    fields.push({
      selector: raw.selector,
      label,
      normalizedLabel,
      type,
      required: raw.required,
      options: raw.options,
      accept: raw.accept,
      hint: raw.hint,
    });
  }

  return fields;
}

export async function parseGreenhouseForm(args: {
  page: Page;
  applyUrl: string;
}): Promise<FormSchema> {
  await args.page.goto(args.applyUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  // Most Greenhouse forms ship inline — give the page a moment to load any
  // JS-rendered fields (e.g. demographic blocks).
  await args.page
    .waitForSelector("form#application-form, form.application-form", {
      timeout: 8_000,
    })
    .catch(() => {
      // Fall through — some boards use the embed iframe.
    });

  const frame = await findFormFrame(args.page);
  if (!frame) {
    throw new Error(
      "Could not locate the Greenhouse application form on the page.",
    );
  }

  const html = await frame.content();
  const hasCaptcha = detectCaptcha(html);

  const fields = await extractFields(frame);
  if (fields.length === 0) {
    throw new Error(
      "Form was detected but no fields could be parsed.  Greenhouse layout may have changed.",
    );
  }

  return {
    ats: "greenhouse",
    applyUrl: args.applyUrl,
    fields,
    hasCaptcha,
  };
}

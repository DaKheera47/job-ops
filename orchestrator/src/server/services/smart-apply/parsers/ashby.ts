/**
 * Ashby apply form parser.
 *
 * Ashby renders a React SPA at jobs.ashbyhq.com/{slug}/{id} and the apply
 * form is on a separate route at jobs.ashbyhq.com/{slug}/{id}/application.
 * The form is JS-rendered, so Playwright is mandatory.
 *
 * Compared to Greenhouse, Ashby uses semantic data attributes on inputs
 * (e.g. data-testid="input--firstName") which makes field detection
 * unusually clean.  We rely on those attributes when present.
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
    .replace(/[* ]+/g, " ")
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
    case "textarea":
      return "textarea";
    case "select":
      return "select";
    default:
      return "text";
  }
}

function deriveApplicationUrl(applyUrl: string): string {
  // Most public Ashby URLs land on the job page, not the application form.
  // We append `/application` if it isn't already there.
  if (applyUrl.includes("/application")) return applyUrl;
  return applyUrl.replace(/\/$/, "") + "/application";
}

async function extractAshbyFields(frame: Frame): Promise<FormField[]> {
  const rawFields = await frame.evaluate(() => {
    const result: Array<{
      selector: string;
      label: string;
      tag: string;
      inputType: string;
      required: boolean;
      options?: Array<{ value: string; label: string }>;
      accept?: string;
    }> = [];

    function escapeAttr(value: string): string {
      return value.replace(/"/g, '\\"');
    }

    function buildSelector(el: Element): string | null {
      const testId = el.getAttribute("data-testid");
      if (testId) return `[data-testid="${escapeAttr(testId)}"]`;
      const id = el.getAttribute("id");
      if (id) return `#${id.replace(/([!"#$%&'()*+,./:;<=>?@\[\\\]^`{|}~ ])/g, "\\$1")}`;
      const name = el.getAttribute("name");
      if (name) return `${el.tagName.toLowerCase()}[name="${escapeAttr(name)}"]`;
      return null;
    }

    function findLabel(el: Element): string {
      // Ashby uses <label> elements next to inputs.
      const id = el.getAttribute("id");
      if (id) {
        const lab = document.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`);
        if (lab?.textContent) return lab.textContent.trim();
      }
      let cur: Element | null = el.parentElement;
      while (cur && cur !== document.body) {
        const labChild = cur.querySelector?.("label");
        if (labChild?.textContent) return labChild.textContent.trim();
        cur = cur.parentElement;
      }
      const aria = el.getAttribute("aria-label");
      if (aria) return aria.trim();
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) return placeholder.trim();
      return "";
    }

    const inputs = document.querySelectorAll(
      "form input, form textarea, form select, [data-testid^='input--']",
    );

    const visited = new Set<Element>();
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

      const field: (typeof result)[number] = {
        selector,
        label,
        tag,
        inputType: type,
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

      result.push(field);
    }

    return result;
  });

  return rawFields.map((raw) => ({
    selector: raw.selector,
    label: raw.label,
    normalizedLabel: normalizeLabel(raw.label),
    type: inputTypeOf(raw.inputType),
    required: raw.required,
    options: raw.options,
    accept: raw.accept,
  }));
}

export async function parseAshbyForm(args: {
  page: Page;
  applyUrl: string;
}): Promise<FormSchema> {
  const target = deriveApplicationUrl(args.applyUrl);
  await args.page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  // Ashby's React form is rendered after hydration — wait for the first
  // input to materialise.
  await args.page
    .waitForSelector("form input, [data-testid^='input--']", {
      timeout: 12_000,
    })
    .catch(() => {
      // Fall through; extractAshbyFields will throw if nothing found.
    });

  const frame = args.page.mainFrame();
  const html = await frame.content();
  const hasCaptcha = detectCaptcha(html);
  const fields = await extractAshbyFields(frame);

  if (fields.length === 0) {
    throw new Error(
      "Ashby application form did not render any fields.  The job may require login or the slug may be wrong.",
    );
  }

  return {
    ats: "ashby",
    applyUrl: target,
    fields,
    hasCaptcha,
  };
}

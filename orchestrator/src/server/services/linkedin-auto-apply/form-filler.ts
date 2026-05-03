import type { Page } from "playwright";
import { humanClick, humanType, randomDelay } from "./human-like";

interface ProfileData {
  name: string;
  email: string;
  phone: string;
}

type FillResult = "filled" | "skipped" | "needs_human";

export async function fillContactInfo(
  page: Page,
  profile: ProfileData,
): Promise<void> {
  // LinkedIn Easy Apply pre-fills most contact info from profile.
  // We verify and correct if empty.
  const fields = [
    { label: /email/i, value: profile.email },
    { label: /phone/i, value: profile.phone },
  ];

  for (const { label, value } of fields) {
    if (!value) continue;
    try {
      const input = page.getByLabel(label).first();
      const current = await input.inputValue({ timeout: 2_000 });
      if (!current.trim()) {
        await input.clear();
        await humanType(page, input, value);
      }
    } catch {
      // field may not exist on this step — that's OK
    }
    await randomDelay(500, 1_000);
  }
}

export async function uploadResume(
  page: Page,
  pdfPath: string,
): Promise<FillResult> {
  try {
    // LinkedIn shows file input for resume upload
    const fileInput = page.locator('input[type="file"]').first();
    const isVisible = await fileInput.isVisible({ timeout: 3_000 });
    if (!isVisible) return "skipped";

    await fileInput.setInputFiles(pdfPath);
    await randomDelay(1_000, 2_000);
    return "filled";
  } catch {
    return "needs_human";
  }
}

export async function fillTextQuestion(
  page: Page,
  label: string,
  answer: string,
): Promise<FillResult> {
  try {
    const input = page.getByLabel(label, { exact: false }).first();
    const isVisible = await input.isVisible({ timeout: 2_000 });
    if (!isVisible) return "skipped";

    await input.clear();
    await humanType(page, input, answer);
    return "filled";
  } catch {
    return "needs_human";
  }
}

export async function fillDropdownQuestion(
  page: Page,
  label: string,
  value: string,
): Promise<FillResult> {
  try {
    const select = page.getByLabel(label, { exact: false }).first();
    const isVisible = await select.isVisible({ timeout: 2_000 });
    if (!isVisible) return "skipped";

    await select.selectOption({ label: value });
    await randomDelay(300, 700);
    return "filled";
  } catch {
    try {
      // Some dropdowns are custom — try clicking option text
      const select = page.getByLabel(label, { exact: false }).first();
      await humanClick(page, select);
      await randomDelay(300, 600);
      const option = page.getByRole("option", { name: value }).first();
      await humanClick(page, option);
      return "filled";
    } catch {
      return "needs_human";
    }
  }
}

export async function fillRadioQuestion(
  page: Page,
  label: string,
  value: string,
): Promise<FillResult> {
  try {
    const group = page.getByRole("radiogroup").filter({ hasText: label });
    const radio = group.getByLabel(value, { exact: false }).first();
    const isVisible = await radio.isVisible({ timeout: 2_000 });
    if (!isVisible) return "skipped";

    await humanClick(page, radio);
    return "filled";
  } catch {
    return "needs_human";
  }
}

export async function tryAutoFillKnownQuestions(
  page: Page,
): Promise<{ filled: number; needsHuman: boolean }> {
  let filled = 0;
  let needsHuman = false;

  // Common Easy Apply questions and safe default answers
  const knownPatterns: Array<{
    pattern: RegExp;
    answer: string;
    type: "text" | "radio" | "dropdown";
  }> = [
    {
      pattern: /years? of (?:work )?experience/i,
      answer: "5",
      type: "text",
    },
    {
      pattern: /authorized to work/i,
      answer: "Yes",
      type: "radio",
    },
    {
      pattern: /require.*(?:visa|sponsorship)/i,
      answer: "No",
      type: "radio",
    },
    {
      pattern: /willing to relocate/i,
      answer: "Yes",
      type: "radio",
    },
  ];

  // Collect all visible labels in the form
  const labels = await page.locator("label").allTextContents();

  for (const labelText of labels) {
    const trimmed = labelText.trim();
    if (!trimmed) continue;

    for (const { pattern, answer, type } of knownPatterns) {
      if (!pattern.test(trimmed)) continue;

      let result: FillResult;
      if (type === "text") {
        result = await fillTextQuestion(page, trimmed, answer);
      } else if (type === "radio") {
        result = await fillRadioQuestion(page, trimmed, answer);
      } else {
        result = await fillDropdownQuestion(page, trimmed, answer);
      }

      if (result === "filled") filled++;
      if (result === "needs_human") needsHuman = true;
      break;
    }
  }

  // Check for unfilled required fields
  const requiredInputs = page.locator("[required]:visible, [aria-required='true']:visible");
  const count = await requiredInputs.count();
  for (let i = 0; i < count; i++) {
    const input = requiredInputs.nth(i);
    try {
      const val = await input.inputValue({ timeout: 1_000 });
      if (!val.trim()) {
        needsHuman = true;
        break;
      }
    } catch {
      // not an input element or not interactable
    }
  }

  return { filled, needsHuman };
}

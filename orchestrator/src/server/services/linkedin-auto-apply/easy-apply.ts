import { join } from "node:path";
import { logger } from "@infra/logger";
import type { Browser, BrowserContext, Page } from "playwright";
import { firefox } from "playwright";
import type { LinkedInApplyProgress } from "@shared/types";
import {
  ensureChallengeViewer,
  createChallengeViewerSession,
  buildChallengeViewerUrl,
} from "../challenge-viewer";
import {
  fillContactInfo,
  tryAutoFillKnownQuestions,
  uploadResume,
} from "./form-filler";
import { humanClick, humanScroll, randomDelay } from "./human-like";
import { updateLinkedInApplyProgress } from "./progress";
import {
  loadLinkedInCookies,
  readLinkedInCookieJar,
  saveLinkedInCookies,
  verifyLinkedInSession,
} from "./session";

export interface EasyApplyOptions {
  jobId: string;
  jobUrl: string;
  pdfPath: string | null;
  profileName: string;
  profileEmail: string;
  profilePhone: string;
  autoSubmit: boolean;
  signal?: AbortSignal;
}

export interface EasyApplyResult {
  success: boolean;
  error?: string;
  manualRequired?: boolean;
  viewerUrl?: string;
}

function emit(
  jobId: string,
  update: Partial<LinkedInApplyProgress>,
): void {
  updateLinkedInApplyProgress({
    step: "idle",
    message: "",
    jobId,
    ...update,
  });
}

async function launchBrowser(
  userAgent?: string,
): Promise<{ browser: Browser; context: BrowserContext }> {
  let launchOptions: Record<string, unknown> = {
    headless: false,
    args: ["--no-sandbox"],
  };

  try {
    const camoufox = await import("camoufox-js");
    const opts = await camoufox.launchOptions({
      headless: false,
      humanize: true,
      geoip: true,
      block_webrtc: true,
    });
    launchOptions = opts;
  } catch {
    logger.warn(
      "[linkedin-apply] Camoufox unavailable, using vanilla Firefox",
    );
  }

  const browser = await firefox.launch(launchOptions);
  const context = await browser.newContext(
    userAgent ? { userAgent } : undefined,
  );
  return { browser, context };
}

async function detectEasyApply(
  page: Page,
): Promise<boolean> {
  try {
    // LinkedIn Easy Apply button contains text "Easy Apply"
    const easyApplyBtn = page
      .getByRole("button", { name: /easy apply/i })
      .first();
    return await easyApplyBtn.isVisible({ timeout: 5_000 });
  } catch {
    return false;
  }
}

async function clickEasyApply(page: Page): Promise<boolean> {
  try {
    const btn = page
      .getByRole("button", { name: /easy apply/i })
      .first();
    await humanClick(page, btn);
    await randomDelay(1_500, 3_000);
    return true;
  } catch {
    return false;
  }
}

async function processFormSteps(
  page: Page,
  options: EasyApplyOptions,
  jobId: string,
  viewerUrl: string,
): Promise<{ submitted: boolean; needsHuman: boolean }> {
  const maxSteps = 10;

  for (let step = 0; step < maxSteps; step++) {
    await randomDelay(1_000, 2_000);

    // Check for confirmation/success
    try {
      const submitted = page.locator(
        'text=/application.*sent|successfully.*applied|application.*submitted/i',
      );
      if (await submitted.isVisible({ timeout: 1_000 })) {
        return { submitted: true, needsHuman: false };
      }
    } catch {
      // not submitted yet
    }

    // Try upload resume if file input visible
    if (options.pdfPath) {
      const resolvedPath = options.pdfPath.startsWith("/")
        ? options.pdfPath
        : join(process.env.DATA_DIR || "/app/data", "pdfs", options.pdfPath);

      emit(jobId, {
        step: "uploading_resume",
        message: "Uploading resume PDF...",
        viewerUrl,
      });
      await uploadResume(page, resolvedPath);
    }

    // Fill contact info
    emit(jobId, {
      step: "filling_form",
      message: "Filling application form...",
      viewerUrl,
    });

    await fillContactInfo(page, {
      name: options.profileName,
      email: options.profileEmail,
      phone: options.profilePhone,
    });

    // Try known questions
    const { needsHuman } = await tryAutoFillKnownQuestions(page);

    if (needsHuman) {
      emit(jobId, {
        step: "waiting_for_review",
        message: "Some fields need your input. Please fill them via the browser viewer.",
        viewerUrl,
        needsHumanInput: true,
      });

      // Wait for user to interact — poll for Next/Submit button click or page change
      await waitForUserAction(page, 120_000);
    }

    // Try to click "Next" or "Review" button
    const nextBtn = page
      .getByRole("button", { name: /next|continue|review/i })
      .first();
    try {
      if (await nextBtn.isVisible({ timeout: 2_000 })) {
        await humanClick(page, nextBtn);
        await randomDelay(1_500, 2_500);
        continue;
      }
    } catch {
      // no next button
    }

    // Check for Submit button
    const submitBtn = page
      .getByRole("button", { name: /submit application|submit/i })
      .first();
    try {
      if (await submitBtn.isVisible({ timeout: 2_000 })) {
        if (options.autoSubmit) {
          emit(jobId, {
            step: "submitting",
            message: "Submitting application...",
            viewerUrl,
          });
          await humanClick(page, submitBtn);
          await randomDelay(2_000, 4_000);
          return { submitted: true, needsHuman: false };
        }

        emit(jobId, {
          step: "waiting_for_review",
          message: "Application ready! Please review and click Submit in the browser viewer.",
          viewerUrl,
          needsHumanInput: true,
        });

        // Wait for user to submit
        const userSubmitted = await waitForSubmission(page, 300_000);
        return { submitted: userSubmitted, needsHuman: !userSubmitted };
      }
    } catch {
      // no submit button
    }

    // Check for "Done" or "Dismiss" (post-submit)
    try {
      const doneBtn = page
        .getByRole("button", { name: /done|dismiss/i })
        .first();
      if (await doneBtn.isVisible({ timeout: 1_000 })) {
        await humanClick(page, doneBtn);
        return { submitted: true, needsHuman: false };
      }
    } catch {
      // no done button
    }
  }

  return { submitted: false, needsHuman: true };
}

async function waitForUserAction(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  const initialUrl = page.url();

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2_000));
    const currentUrl = page.url();
    if (currentUrl !== initialUrl) return;

    // Check if form state changed (next/submit clicked)
    try {
      const submitted = page.locator(
        'text=/application.*sent|successfully|submitted/i',
      );
      if (await submitted.isVisible({ timeout: 500 })) return;
    } catch {
      // continue waiting
    }
  }
}

async function waitForSubmission(
  page: Page,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2_000));
    try {
      const confirmation = page.locator(
        'text=/application.*sent|successfully.*applied|application.*submitted/i',
      );
      if (await confirmation.isVisible({ timeout: 500 })) return true;

      // Check if the submit button disappeared (user clicked it)
      const submitBtn = page
        .getByRole("button", { name: /submit application|submit/i })
        .first();
      if (!(await submitBtn.isVisible({ timeout: 500 }))) return true;
    } catch {
      // continue waiting
    }
  }
  return false;
}

export async function executeEasyApply(
  options: EasyApplyOptions,
): Promise<EasyApplyResult> {
  const { jobId, jobUrl, signal } = options;
  let browser: Browser | null = null;

  try {
    // Step 1: Ensure VNC is available
    emit(jobId, {
      step: "opening_browser",
      message: "Starting browser...",
    });

    const viewerStatus = await ensureChallengeViewer();
    if (!viewerStatus.available) {
      return {
        success: false,
        error: "Browser viewer is not available",
      };
    }

    const { token } = createChallengeViewerSession({ ttlMs: 15 * 60 * 1000 });
    const viewerUrl = buildChallengeViewerUrl({ token });

    // Step 2: Launch browser and load cookies
    const cookieJar = await readLinkedInCookieJar();
    const launched = await launchBrowser(cookieJar.userAgent);
    browser = launched.browser;
    const { context } = launched;

    const loaded = await loadLinkedInCookies(context);
    if (loaded === 0) {
      await browser.close();
      return {
        success: false,
        error: "LinkedIn session not found. Please log in first.",
        viewerUrl,
      };
    }

    const page = await context.newPage();

    // Step 3: Navigate to job
    emit(jobId, {
      step: "navigating",
      message: "Opening job listing...",
      viewerUrl,
    });

    if (signal?.aborted) throw new Error("Cancelled");

    await page.goto(jobUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await randomDelay(2_000, 4_000);
    await humanScroll(page);

    // Step 4: Verify session
    if (page.url().includes("/login") || page.url().includes("/authwall")) {
      await browser.close();
      return {
        success: false,
        error: "LinkedIn session expired. Please log in again.",
        viewerUrl,
      };
    }

    // Step 5: Detect Easy Apply
    emit(jobId, {
      step: "detecting_easy_apply",
      message: "Checking for Easy Apply...",
      viewerUrl,
    });

    const hasEasyApply = await detectEasyApply(page);
    if (!hasEasyApply) {
      emit(jobId, {
        step: "manual_required",
        message: "This job doesn't support Easy Apply. Please apply manually.",
        detail: jobUrl,
        viewerUrl,
      });
      await saveLinkedInCookies(context);
      await browser.close();
      return {
        success: false,
        manualRequired: true,
        viewerUrl,
      };
    }

    // Step 6: Click Easy Apply
    if (signal?.aborted) throw new Error("Cancelled");

    const clicked = await clickEasyApply(page);
    if (!clicked) {
      await browser.close();
      return {
        success: false,
        error: "Failed to open Easy Apply form",
        viewerUrl,
      };
    }

    // Step 7: Process form steps
    emit(jobId, {
      step: "filling_form",
      message: "Filling application form...",
      viewerUrl,
    });

    const result = await processFormSteps(page, options, jobId, viewerUrl);

    // Step 8: Verify and clean up
    await saveLinkedInCookies(context);

    if (result.submitted) {
      emit(jobId, {
        step: "completed",
        message: "Application submitted successfully!",
        viewerUrl,
      });
      await randomDelay(2_000, 3_000);
      await browser.close();
      return { success: true, viewerUrl };
    }

    emit(jobId, {
      step: "failed",
      message: "Could not complete the application automatically.",
      viewerUrl,
    });
    await browser.close();
    return {
      success: false,
      error: "Application form could not be completed",
      viewerUrl,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("LinkedIn Easy Apply failed", {
      jobId,
      error: message,
    });
    emit(jobId, {
      step: "failed",
      message: `Error: ${message}`,
      error: message,
    });
    if (browser) await browser.close().catch(() => {});
    return { success: false, error: message };
  }
}

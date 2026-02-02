import { readFileSync } from "node:fs";
import { createPlaywrightRouter, log } from "crawlee";
import { markJobPageDone, markListPageDone } from "./progress.js";

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    // Keep search params (some sites encode job IDs there); just normalize trailing slash.
    const normalized = url.toString().replace(/\/$/, "");
    return normalized;
  } catch {
    return raw.replace(/\/$/, "");
  }
}

function getExistingJobUrlSet(): Set<string> {
  const filePath = process.env.JOBOPS_EXISTING_JOB_URLS_FILE;
  const raw = filePath
    ? (() => {
        try {
          return readFileSync(filePath, "utf-8");
        } catch {
          return null;
        }
      })()
    : process.env.JOBOPS_EXISTING_JOB_URLS;

  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const normalized = parsed
      .map((u) => normalizeUrl(typeof u === "string" ? u : null))
      .filter((u): u is string => Boolean(u));
    return new Set(normalized);
  } catch {
    return new Set();
  }
}

const SKIP_APPLY_FOR_EXISTING =
  process.env.JOBOPS_SKIP_APPLY_FOR_EXISTING === "1";
const EXISTING_JOB_URLS = getExistingJobUrlSet();

// Global counters for max jobs per search term
const jobCounts = new Map<string, number>();
const MAX_JOBS_PER_TERM = parseInt(
  process.env.GRADCRACKER_MAX_JOBS_PER_TERM || "0",
  10,
);

interface Job {
  title: string | null;
  jobUrl: string | null;
  employer: string | null;
  employerUrl: string | null;
  disciplines: string | null;
  deadline: string | null;
  salary: string | null;
  location: string | null;
  degreeRequired: string | null;
  starting: string | null;
}

export const router = createPlaywrightRouter();

router.addHandler(
  "gradcracker-list-page",
  async ({ page, request, enqueueLinks }) => {
    const { role } = request.userData;
    log.info(`Processing: ${request.url} (Role: ${role})`);

    if (MAX_JOBS_PER_TERM > 0) {
      const currentCount = jobCounts.get(role) || 0;
      if (currentCount >= MAX_JOBS_PER_TERM) {
        log.info(
          `Max jobs (${MAX_JOBS_PER_TERM}) already enqueued for role "${role}". Skipping list page.`,
        );
        markListPageDone({
          currentUrl: request.url,
          jobCardsFound: 0,
          jobPagesEnqueued: 0,
          jobPagesSkipped: 0,
        });
        return;
      }
    }

    // Wait until the job cards are rendered
    await page.waitForSelector("article[wire\\:key]", { timeout: 10000 });

    // Add delay to see the page load
    await page.waitForTimeout(3000);

    const toAbsolute = (href: string | null) => {
      if (!href) return null;
      try {
        return new URL(href, request.loadedUrl).href;
      } catch {
        return href;
      }
    };

    const articles = await page.locator("article[wire\\:key]").all();
    const jobs: Job[] = [];
    let skippedKnownJobs = 0;
    let enqueuedJobs = 0;

    console.log(`${articles.length} jobs found`);

    let idx = 1;
    for (const article of articles) {
      const titleLocator = article.locator("h2 a");
      const title = (await titleLocator.textContent())?.trim() ?? null;
      const jobUrl = toAbsolute(await titleLocator.getAttribute("href"));

      const employerImg = article.locator("figure img");
      const employer = (await employerImg.getAttribute("alt"))?.trim() ?? null;

      const employerAnchor = article.locator("figure a");
      const employerUrl = toAbsolute(await employerAnchor.getAttribute("href"));

      let disciplines: string | null = null;
      try {
        const disciplinesEl = article.locator("h3");
        disciplines =
          (await disciplinesEl.textContent({ timeout: 1000 }))?.trim() ?? null;
      } catch {
        // h3 not found or timed out - that's okay, disciplines is optional
      }

      // Find the "Deadline: ..." pill
      const deadlineLocator = article
        .locator("div", { hasText: "Deadline:" })
        .first();
      let deadline: string | null = null;
      if ((await deadlineLocator.count()) > 0) {
        const deadlineText = (await deadlineLocator.textContent()) ?? "";
        // Extract deadline and clean up whitespace
        deadline =
          deadlineText
            .replace("Deadline:", "")
            .split("\n")[0] // Take only first line
            .trim() || null;
      }

      const getDdText = async (label: string) => {
        // Find dt that has the exact label text (ignoring whitespace)
        const dt = article
          .locator("dt")
          .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) });
        if ((await dt.count()) === 0) return null;

        // Get the next sibling dd
        const dd = dt.locator("+ dd");
        if ((await dd.count()) > 0) {
          const text = await dd.textContent();
          if (!text) return null;
          // Clean up: remove extra whitespace and newlines
          return text.replace(/\s+/g, " ").trim() || null;
        }
        return null;
      };

      const salary = await getDdText("Salary");
      const location = await getDdText("Location");
      const degreeRequired = await getDdText("Degree required");
      const starting = await getDdText("Starting");

      console.log(`Got job ${idx}/${articles.length}: ${title}`);

      jobs.push({
        title,
        jobUrl,
        employer,
        employerUrl,
        disciplines,
        deadline,
        salary,
        location,
        degreeRequired,
        starting,
      });

      idx++;

      // append more links to crawl: single job pages
      if (jobUrl) {
        const jobUrlNormalized = normalizeUrl(jobUrl);
        const isKnownJob =
          SKIP_APPLY_FOR_EXISTING &&
          jobUrlNormalized !== null &&
          EXISTING_JOB_URLS.has(jobUrlNormalized);

        if (isKnownJob) {
          skippedKnownJobs++;
        } else {
          // Check if we reached the limit for this search term
          if (MAX_JOBS_PER_TERM > 0) {
            const currentCount = jobCounts.get(role) || 0;
            if (currentCount >= MAX_JOBS_PER_TERM) {
              log.info(
                `Reached max jobs limit (${MAX_JOBS_PER_TERM}) for role "${role}" while processing list. Stopping.`,
              );
              break;
            }
            jobCounts.set(role, currentCount + 1);
          }

          await enqueueLinks({
            urls: [jobUrl],
            userData: {
              ...jobs[jobs.length - 1],
              label: "gradcracker-single-job-page",
            },
          });
          enqueuedJobs++;
        }
      }
    }

    log.info(`Extracted ${jobs.length} jobs`);
    if (SKIP_APPLY_FOR_EXISTING && skippedKnownJobs > 0) {
      log.info(
        `Skipping ${skippedKnownJobs} already-known job pages; enqueued ${enqueuedJobs} new job pages.`,
      );
    }

    markListPageDone({
      currentUrl: request.url,
      jobCardsFound: jobs.length,
      jobPagesEnqueued: enqueuedJobs,
      jobPagesSkipped: skippedKnownJobs,
    });
  },
);

router.addHandler(
  "gradcracker-single-job-page",
  async ({ page, request, pushData, log }) => {
    const { label, ...jobSummary } = request.userData;
    log.info(`Processing single job page: ${request.url}`);

    // Wait for job content to be present
    await page.waitForSelector(".body-content", { timeout: 10000 });

    // Optional delay if you want to visually see it while debugging
    await page.waitForTimeout(2000);

    const jobDescription =
      (await page.locator(".body-content").textContent())?.trim() || null;

    const applyButton = page.locator('a[dusk="apply-button"]');
    const hasApplyButton = (await applyButton.count()) > 0;

    const requestUrlNormalized = normalizeUrl(request.url);
    const isKnownJob =
      SKIP_APPLY_FOR_EXISTING &&
      requestUrlNormalized !== null &&
      EXISTING_JOB_URLS.has(requestUrlNormalized);

    let applicationLink: string | null = null;
    let spawnedPage: typeof page | null = null;

    if (hasApplyButton && !isKnownJob) {
      const originalUrl = page.url();

      // Prefer page-scoped popup detection. Using the browser context's "page" event
      // can accidentally capture unrelated pages created by other concurrent requests.
      const popupPromise = page
        .waitForEvent("popup", { timeout: 8000 })
        .catch(() => null);
      const navigationPromise = page
        .waitForNavigation({ timeout: 8000, waitUntil: "domcontentloaded" })
        .catch(() => null);

      try {
        // Don't let Playwright auto-wait for navigation; we explicitly handle popup vs same-tab.
        await applyButton.click();

        // Wait for URL to stabilize (same URL for 3 consecutive checks)
        const waitForUrlStable = async (
          targetPage: typeof page,
          maxWaitMs = 10000,
          checkIntervalMs = 100,
          requiredStableChecks = 3,
        ) => {
          let lastUrl = targetPage.url();
          let stableCount = 0;
          const startTime = Date.now();

          while (Date.now() - startTime < maxWaitMs) {
            await targetPage.waitForTimeout(checkIntervalMs);
            const currentUrl = targetPage.url();
            if (currentUrl === lastUrl && !currentUrl.includes("gradcracker")) {
              stableCount++;
              if (stableCount >= requiredStableChecks) return currentUrl;
            } else {
              stableCount = 1;
              lastUrl = currentUrl;
            }
          }
          return lastUrl;
        };

        await waitForUrlStable(page);

        const maybePopup = await popupPromise;
        spawnedPage = maybePopup;

        const targetPage = maybePopup ?? page;

        if (maybePopup) {
          await maybePopup
            .waitForLoadState("domcontentloaded", { timeout: 15000 })
            .catch(() => null);
          // If the popup initially opens as about:blank, give it a moment to redirect.
          if (maybePopup.url() === "about:blank") {
            await maybePopup
              .waitForURL((u) => u.toString() !== "about:blank", {
                timeout: 15000,
              })
              .catch(() => null);
          }
        } else {
          // Same-tab navigation case.
          await navigationPromise;
          await page
            .waitForURL((u) => u.toString() !== originalUrl, { timeout: 15000 })
            .catch(() => null);
        }

        applicationLink = targetPage.url();

        if (applicationLink === originalUrl) {
          log.info(
            `Apply click did not change URL (still Gradcracker): ${applicationLink}`,
          );
        } else {
          log.info(`Captured application URL: ${applicationLink}`);
        }
      } finally {
        // Ensure we don't leak tabs on retries/errors.
        if (spawnedPage && spawnedPage !== page) {
          await spawnedPage.close().catch(() => null);
        }
      }
    } else if (!hasApplyButton) {
      log.warning(`Apply button not found on page: ${request.url}`);
    } else {
      log.info(`Skipping apply click for known job: ${request.url}`);
    }

    await pushData({
      ...jobSummary,
      url: request.url, // Gradcracker job page
      applicationLink, // External or same-page URL after click
      jobDescription,
    });

    markJobPageDone({ currentUrl: request.url });
  },
);

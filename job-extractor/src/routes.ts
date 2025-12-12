import { createPlaywrightRouter, log } from "crawlee";

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
    log.info(`Processing: ${request.url}`);

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
        disciplines = (await disciplinesEl.textContent({ timeout: 1000 }))?.trim() ?? null;
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
        await enqueueLinks({
          urls: [jobUrl],
          userData: {
            ...jobs[jobs.length - 1],
            label: "gradcracker-single-job-page"
          },
        });
      }
    }

    log.info(`Extracted ${jobs.length} jobs`);
  }
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

    let applicationLink: string | null = null;

    if (hasApplyButton) {
      const context = page.context();
      const originalUrl = page.url();

      // Race the click with "a new page opened" event.
      // If it opens in the same tab, waitForEvent('page') will just time out and we fallback.
      const [maybeNewPage] = await Promise.all([
        context.waitForEvent("page").catch(() => null),
        applyButton.click(),
      ]);

      // If a new tab/window opened, use that; otherwise stay on the current page.
      const targetPage = maybeNewPage ?? page;

      // Wait for whatever we landed on to finish loading a bit
      await targetPage.waitForTimeout(7500);

      applicationLink = targetPage.url();

      // Optional sanity check: if the URL is still the original Gradcracker page,
      // you can decide to treat it as "no external app link found".
      if (applicationLink === originalUrl) {
        log.info(
          `Apply click did not change URL (still Gradcracker): ${applicationLink}`
        );
      } else {
        log.info(`Captured application URL: ${applicationLink}`);
      }
    } else {
      log.warning(`Apply button not found on page: ${request.url}`);
    }

    await pushData({
      ...jobSummary,
      url: request.url, // Gradcracker job page
      applicationLink, // External or same-page URL after click
      jobDescription,
    });
  }
);

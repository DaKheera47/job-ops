import { launchOptions } from "camoufox-js";
import {
  firefox,
  type Browser,
  type Page,
  type Response,
} from "playwright-core";
import fs from "node:fs/promises";

type Freshness = "1" | "3" | "7" | "15" | "30";

type Args = {
  keyword: string;
  age: Freshness;
  from: number;
  to: number;
  out: string;
  headless: boolean;
  delay: number;
  debug: boolean;
};

type NaukriResponse = {
  jobDetails?: unknown[];
  [key: string]: unknown;
};

type CapturedRequestDebug = {
  pageNo: number;
  url: string;
  status: number;
  nkparam?: string;
  requestHeaders: Record<string, string>;
};

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];

    if (!current.startsWith("--")) continue;

    const raw = current.slice(2);
    const equalsIndex = raw.indexOf("=");

    if (equalsIndex !== -1) {
      args[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }

    const key = raw;
    const next = argv[i + 1];

    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i++;
    }
  }

  const age = (args.age ?? "3") as Freshness;
  if (!["1", "3", "7", "15", "30"].includes(age)) {
    throw new Error(`Invalid age: ${age}. Must be one of 1, 3, 7, 15, 30`);
  }

  return {
    keyword: args.keyword ?? "software developer",
    age: age,
    from: Number(args.from ?? 1),
    to: Number(args.to ?? 3),
    out: args.out ?? "naukri_jobs.json",
    headless: args.headless !== "false",
    delay: Number(args.delay ?? 1200),
    debug: args.debug === "true",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugifyKeyword(keyword: string): string {
  return keyword
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function makeSearchPageUrl(keyword: string, age: string): string {
  const slug = slugifyKeyword(keyword);
  const url = new URL(`https://www.naukri.com/${slug}-jobs`);

  url.searchParams.set("k", keyword);
  url.searchParams.set("jobAge", age);

  return url.toString();
}

function isNaukriSearchApiResponse(response: Response): boolean {
  return response.url().includes("https://www.naukri.com/jobapi/v3/search");
}

function isApiResponseForPage(response: Response, pageNo: number): boolean {
  if (!isNaukriSearchApiResponse(response)) return false;

  const url = new URL(response.url());
  return url.searchParams.get("pageNo") === String(pageNo);
}

async function assertNotAccessDenied(page: Page, stage: string): Promise<void> {
  const html = await page.content();

  const denied =
    html.includes("<title>Access Denied</title>") ||
    html.includes("errors.edgesuite.net") ||
    html.includes("You don't have permission to access");

  if (!denied) return;

  await page.screenshot({
    path: `naukri_access_denied_${stage}.png`,
    fullPage: true,
  });

  await fs.writeFile(`naukri_access_denied_${stage}.html`, html, "utf8");

  throw new Error(
    `Naukri returned Access Denied during ${stage}. Saved naukri_access_denied_${stage}.html and .png`,
  );
}

async function collectJobsFromResponse(params: {
  response: Response;
  pageNo: number;
  debug: boolean;
  capturedDebug: CapturedRequestDebug[];
}): Promise<unknown[]> {
  const { response, pageNo, debug, capturedDebug } = params;

  const request = response.request();
  const requestHeaders = request.headers();

  capturedDebug.push({
    pageNo,
    url: request.url(),
    status: response.status(),
    nkparam: requestHeaders.nkparam,
    requestHeaders,
  });

  const text = await response.text();

  if (debug) {
    await fs.writeFile(`naukri_api_page_${pageNo}.json`, text, "utf8");
  }

  if (!response.ok()) {
    console.log(`Page ${pageNo}: API returned HTTP ${response.status()}`);
    return [];
  }

  let json: NaukriResponse;

  try {
    json = JSON.parse(text) as NaukriResponse;
  } catch {
    await fs.writeFile(`naukri_api_page_${pageNo}_non_json.txt`, text, "utf8");
    console.log(`Page ${pageNo}: API response was not JSON`);
    return [];
  }

  const jobs = Array.isArray(json.jobDetails) ? json.jobDetails : [];

  console.log(`Page ${pageNo}: ${jobs.length} jobs`);

  return jobs;
}

async function clickNextPage(page: Page, targetPageNo: number): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);

  const nextCandidates = [
    page.getByRole("link", { name: /^next$/i }),
    page.getByRole("button", { name: /^next$/i }),
    page.locator("a:has-text('Next')"),
    page.locator("button:has-text('Next')"),
    page.locator("[aria-label*='Next' i]"),
    page.locator("text=/^Next$/i"),
  ];

  for (const locator of nextCandidates) {
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;

    const first = locator.first();
    if (!(await first.isVisible().catch(() => false))) continue;

    await first.click({ timeout: 7000 });
    return;
  }

  await page.screenshot({
    path: `naukri_pagination_failed_target_${targetPageNo}.png`,
    fullPage: true,
  });

  throw new Error(
    `Could not find/click Next button for page ${targetPageNo}. Saved screenshot.`,
  );
}

function dedupeJobs(jobs: unknown[]): unknown[] {
  const seen = new Set<string>();
  const deduped: unknown[] = [];

  for (const job of jobs) {
    const record = job as Record<string, unknown>;

    const possibleId =
      record.jobId ??
      record.jobid ??
      record.jobID ??
      record.id ??
      record.listingId ??
      JSON.stringify(job);

    const id = String(possibleId);

    if (seen.has(id)) continue;

    seen.add(id);
    deduped.push(job);
  }

  return deduped;
}

async function launchCamoufoxBrowser(args: Args): Promise<Browser> {
  const options = await launchOptions({
    headless: args.headless,
  });

  return await firefox.launch({
    ...options,

    // Keep this explicit so CLI controls it.
    headless: args.headless,
  });
}

async function waitForApiPage(params: {
  page: Page;
  pageNo: number;
  timeoutMs: number;
}): Promise<Response> {
  const { page, pageNo, timeoutMs } = params;

  try {
    return await page.waitForResponse(
      (response) => isApiResponseForPage(response, pageNo),
      { timeout: timeoutMs },
    );
  } catch {
    await page.screenshot({
      path: `naukri_wait_timeout_page_${pageNo}.png`,
      fullPage: true,
    });

    await fs.writeFile(
      `naukri_wait_timeout_page_${pageNo}.html`,
      await page.content(),
      "utf8",
    );

    throw new Error(
      `Timed out waiting for API page ${pageNo}. Saved timeout HTML and screenshot.`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.from < 1) throw new Error("--from must be >= 1");
  if (args.to < args.from) throw new Error("--to must be >= --from");

  const searchPageUrl = makeSearchPageUrl(args.keyword, args.age);

  console.log("Keyword:", args.keyword);
  console.log("Job age:", args.age);
  console.log("Pages:", `${args.from} to ${args.to}`);
  console.log("Search page:", searchPageUrl);
  console.log("Camoufox headless:", args.headless);

  const browser = await launchCamoufoxBrowser(args);

  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 900,
    },
  });

  const page = await context.newPage();

  const allJobs: unknown[] = [];
  const capturedDebug: CapturedRequestDebug[] = [];

  try {
    console.log("\n[1] Opening search page with Camoufox...");

    const firstApiResponsePromise = waitForApiPage({
      page,
      pageNo: 1,
      timeoutMs: 45000,
    });

    await page.goto(searchPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await assertNotAccessDenied(page, "initial_load");

    const firstApiResponse = await firstApiResponsePromise;

    const pageOneJobs = await collectJobsFromResponse({
      response: firstApiResponse,
      pageNo: 1,
      debug: args.debug,
      capturedDebug,
    });

    if (args.from <= 1) {
      allJobs.push(...pageOneJobs);
    }

    for (let pageNo = 2; pageNo <= args.to; pageNo++) {
      console.log(`\n[2] Moving to page ${pageNo}...`);

      const apiResponsePromise = waitForApiPage({
        page,
        pageNo,
        timeoutMs: 45000,
      });

      await clickNextPage(page, pageNo);

      const apiResponse = await apiResponsePromise;

      await assertNotAccessDenied(page, `page_${pageNo}`);

      const jobs = await collectJobsFromResponse({
        response: apiResponse,
        pageNo,
        debug: args.debug,
        capturedDebug,
      });

      if (pageNo >= args.from) {
        allJobs.push(...jobs);
      }

      await sleep(args.delay);
    }
  } finally {
    await browser.close();
  }

  const dedupedJobs = dedupeJobs(allJobs);

  const finalJobs = dedupedJobs.map((job) => {
    const record = job as Record<string, any>;
    if (record.jdURL && typeof record.jdURL === "string" && !record.jdURL.startsWith("http")) {
      return {
        ...record,
        jdURL: `https://www.naukri.com${record.jdURL}`,
      };
    }
    return job;
  });

  await fs.writeFile(args.out, JSON.stringify(finalJobs, null, 2), "utf8");

  await fs.writeFile(
    "naukri_captured_requests_debug.json",
    JSON.stringify(capturedDebug, null, 2),
    "utf8",
  );

  console.log(`\nSaved ${dedupedJobs.length} jobs to ${args.out}`);
  console.log(
    "Saved captured request debug to naukri_captured_requests_debug.json",
  );
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});

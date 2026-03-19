// For more information, see https://crawlee.dev/

import {
  createLaunchOptions,
  isChallengePage,
  loadCookies,
  saveCookies,
  waitForChallengeResolution,
} from "browser-utils";
import { log, PlaywrightCrawler } from "crawlee";
import { firefox } from "playwright";
import { emitChallengeRequired, initJobOpsProgress } from "./progress.js";
import { router } from "./routes.js";

// locations
const locations = [
  "london-and-south-east",
  "north-west",
  "yorkshire",
  "east-midlands",
  "west-midlands",
  "south-west",
];

// roles
const defaultRoles = ["web-development", "software-systems"];

let roles = defaultRoles;
const envRolesRaw = process.env.GRADCRACKER_SEARCH_TERMS;

if (envRolesRaw) {
  try {
    const parsed = JSON.parse(envRolesRaw) as string[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      roles = parsed.map((term) =>
        term
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      );
      console.log(`Using configured search terms: ${roles.join(", ")}`);
    }
  } catch (e) {
    console.warn("Failed to parse GRADCRACKER_SEARCH_TERMS", e);
  }
}

// combo of locations and roles
const gradcrackerUrls = locations.flatMap((location) => {
  return roles.map((role) => {
    return {
      url: `https://www.gradcracker.com/search/computing-technology/${role}-graduate-jobs-in-${location}?order=dateAdded`,
      role,
    };
  });
});

console.log(`Total gradcracker URLs: ${gradcrackerUrls.length}`);

const startUrls = gradcrackerUrls.map(({ url, role }) => ({
  url,
  userData: { label: "gradcracker-list-page", role },
}));

initJobOpsProgress(startUrls.length);

const EXTRACTOR_ID = "gradcracker";
const STORAGE_DIR = "./storage";

const { launchOptions } = await createLaunchOptions({ headless: true });

// Track whether we've loaded cookies for the first request
// Crawlee reuses the browser context across requests, so we only need to
// inject cookies once. The flag prevents redundant disk reads on every request.
let cookiesLoaded = false;

const crawler = new PlaywrightCrawler({
  requestHandler: router,
  minConcurrency: 1,
  maxConcurrency: 2,
  navigationTimeoutSecs: 60,
  requestHandlerTimeoutSecs: 100,
  maxRequestRetries: 3,
  browserPoolOptions: {
    // Disable the default fingerprint spoofing to avoid conflicts with Camoufox.
    useFingerprints: false,
  },
  launchContext: {
    launcher: firefox,
    launchOptions,
  },

  // Load saved CF cookies before navigation — may skip challenges entirely
  preNavigationHooks: [
    async ({ page }) => {
      if (!cookiesLoaded) {
        const context = page.context();
        const loaded = await loadCookies(context, EXTRACTOR_ID, STORAGE_DIR);
        if (loaded > 0) {
          log.info(`Loaded ${loaded} cached cookies for ${EXTRACTOR_ID}`);
        }
        cookiesLoaded = true;
      }
    },
  ],

  // After navigation: detect CF challenges, wait for resolution, save cookies
  postNavigationHooks: [
    async ({ page, request }) => {
      if (!(await isChallengePage(page))) return;

      log.warning(
        `Cloudflare challenge detected on ${request.url}, waiting for resolution...`,
      );
      const result = await waitForChallengeResolution(page, 30_000);

      if (result.status === "passed") {
        log.info(`Challenge passed for ${request.url}`);
        // Persist cookies so future requests (and runs) can skip the challenge
        await saveCookies(page.context(), EXTRACTOR_ID, STORAGE_DIR);
      } else {
        // Signal the orchestrator that a human needs to solve this challenge
        emitChallengeRequired(request.url);
        // Throw to trigger Crawlee's built-in retry
        throw new Error(
          `Cloudflare challenge ${result.status} on ${request.url}`,
        );
      }
    },
  ],
});

await crawler.run(startUrls);

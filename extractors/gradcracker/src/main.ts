// For more information, see https://crawlee.dev/
import { launchOptions } from "camoufox-js";
import { PlaywrightCrawler } from "crawlee";
import { firefox } from "playwright";

import { router } from "./routes.js";
import { initJobOpsProgress } from "./progress.js";

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
const defaultRoles = [
  "web-development",
  "software-systems",
];

let roles = defaultRoles;
const envRolesRaw = process.env.GRADCRACKER_SEARCH_TERMS;

if (envRolesRaw) {
  try {
    const parsed = JSON.parse(envRolesRaw) as string[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      roles = parsed.map(term =>
        term.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
      console.log(`Using configured search terms: ${roles.join(', ')}`);
    }
  } catch (e) {
    console.warn('Failed to parse GRADCRACKER_SEARCH_TERMS', e);
  }
}

// combo of locations and roles
const gradcrackerUrls = locations.flatMap((location) => {
  return roles.map((role) => {
    return `https://www.gradcracker.com/search/computing-technology/${role}-graduate-jobs-in-${location}?order=dateAdded`;
  });
});

console.log(`Total gradcracker URLs: ${gradcrackerUrls.length}`)

const startUrls = gradcrackerUrls.map((url) => ({
  url,
  userData: { label: "gradcracker-list-page" },
}));

initJobOpsProgress(startUrls.length);

const crawler = new PlaywrightCrawler({
  // proxyConfiguration: new ProxyConfiguration({ proxyUrls: ['...'] }),
  requestHandler: router,
  // Comment this option to scrape the full website.
  // maxRequestsPerCrawl: 2000,
  // Add delay between requests to slow down the process
  minConcurrency: 1,
  maxConcurrency: 2,
  navigationTimeoutSecs: 60,
  // Add delay between requests (in milliseconds)
  requestHandlerTimeoutSecs: 100,
  browserPoolOptions: {
    // Disable the default fingerprint spoofing to avoid conflicts with Camoufox.
    useFingerprints: false,
  },
  launchContext: {
    launcher: firefox,
    launchOptions: await launchOptions({
      headless: true,
      humanize: true,
      geoip: true,
    }),
  },
});

await crawler.run(startUrls);

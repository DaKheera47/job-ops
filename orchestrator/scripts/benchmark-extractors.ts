import assert from "node:assert/strict";
import type { ExtractorRunResult } from "@shared/types/extractors";
import {
  discoverManifestPaths,
  loadManifestFromFile,
} from "../src/server/extractors/discovery";

const LIMIT = 50;
const CAPTCHA_PATTERN =
  /captcha|cloudflare|cf-mitigated|turnstile|challenge required/i;
const searchTerm = process.argv.slice(2).join(" ") || "software engineer";
const limitSettings = Object.fromEntries(
  [
    "jobspyResultsWanted",
    "gradcrackerMaxJobsPerTerm",
    "ukvisajobsMaxJobs",
    "adzunaMaxJobsPerTerm",
    "startupjobsMaxJobsPerTerm",
    "jobindexMaxJobsPerTerm",
    "seekMaxJobsPerTerm",
    "naukriMaxJobsPerTerm",
    "wazzufMaxJobsPerTerm",
    "fiveamsatMaxJobsPerTerm",
  ].map((key) => [key, String(LIMIT)]),
);

function captchaMessage(result: ExtractorRunResult): string | undefined {
  const message = [result.error, ...(result.sourceErrors ?? [])]
    .filter(Boolean)
    .join(" ");
  return (
    result.challengeRequired ||
    (CAPTCHA_PATTERN.test(message) ? message : undefined)
  );
}

assert.equal(captchaMessage({ success: true, jobs: [] }), undefined);
assert.equal(
  captchaMessage({ success: false, jobs: [], error: "CAPTCHA required" }),
  "CAPTCHA required",
);

const manifests = await Promise.all(
  (await discoverManifestPaths()).map(loadManifestFromFile),
);
const rows: Array<Record<string, string | number>> = [];
let failed = false;

for (const manifest of manifests) {
  const source = manifest.providesSources[0];
  const missingEnv = (manifest.requiredEnvVars ?? []).filter(
    (name) => !process.env[name]?.trim(),
  );

  if (!source || missingEnv.length > 0) {
    rows.push({
      extractor: manifest.displayName,
      source: source ?? "-",
      country: "-",
      jobs: 0,
      seconds: "-",
      captcha: "-",
      status: `SKIP: missing ${missingEnv.join(", ") || "source"}`,
    });
    continue;
  }

  const supported =
    manifest.locationCapabilities?.[source]?.supportedCountryKeys;
  const country = supported?.includes("united kingdom")
    ? "united kingdom"
    : (supported?.[0] ?? "united kingdom");
  const startedAt = performance.now();

  try {
    const result = await manifest.run({
      source,
      selectedSources: [source],
      settings: { ...limitSettings, jobspyCountryIndeed: country },
      searchTerms: [searchTerm],
      selectedCountry: country,
      getExistingJobUrls: async () => [],
    });
    const captcha = captchaMessage(result);
    const jobs = result.jobs.length;
    const status = captcha
      ? "FAIL: CAPTCHA"
      : !result.success
        ? "ERROR"
        : jobs >= LIMIT
          ? "PASS"
          : `SHORT: ${jobs}/${LIMIT}`;
    failed ||= status !== "PASS";
    rows.push({
      extractor: manifest.displayName,
      source,
      country,
      jobs,
      seconds: ((performance.now() - startedAt) / 1_000).toFixed(2),
      captcha: captcha ? "yes" : "no",
      status,
      ...(captcha || result.error
        ? {
            detail: (captcha ?? result.error ?? "")
              .replace(/\s+/g, " ")
              .slice(0, 120),
          }
        : {}),
    });
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    const captcha = CAPTCHA_PATTERN.test(message);
    rows.push({
      extractor: manifest.displayName,
      source,
      country,
      jobs: 0,
      seconds: ((performance.now() - startedAt) / 1_000).toFixed(2),
      captcha: captcha ? "yes" : "no",
      status: captcha ? "FAIL: CAPTCHA" : "ERROR",
      detail: message.replace(/\s+/g, " ").slice(0, 120),
    });
  }
}

console.table(rows);
process.exitCode = failed ? 1 : 0;

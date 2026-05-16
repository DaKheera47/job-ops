import type {
  ExtractorManifest,
  ExtractorRuntimeContext,
} from "@shared/types/extractors";
import type { CreateJobInput } from "@shared/types/jobs";
import { runJobSpy } from "./src/run";

type JobSpySite = NonNullable<Parameters<typeof runJobSpy>[0]["sites"]>[number];

const JOBSPY_SOURCES = new Set<JobSpySite>(["indeed", "linkedin", "glassdoor"]);

function isJobSpySite(source: string): source is JobSpySite {
  return JOBSPY_SOURCES.has(source as JobSpySite);
}

/**
 * Parse the `jobspyCountryIndeed` setting as a comma-separated list of
 * country tokens that JobSpy accepts (e.g. "germany,united arab emirates,
 * cyprus,israel,netherlands,switzerland").  Falls back to a single-element
 * list for backward compatibility with users who set just one country.
 *
 * Returns an empty array if no country is configured — caller can decide
 * whether to default to "anywhere" or skip.
 */
function parseCountriesList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// Each `runJobSpy` per-country invocation is a separate Python subprocess
// with its own output filename (country slug is part of the suffix), so
// parallel execution is safe — no shared state, no filename collisions.
const JOBSPY_COUNTRY_CONCURRENCY = 3;

async function runCountriesInParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  shouldStop?: () => boolean,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      if (shouldStop?.()) return;
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export const manifest: ExtractorManifest = {
  id: "jobspy",
  displayName: "JobSpy",
  providesSources: ["indeed", "linkedin", "glassdoor"],
  capabilities: { locationEvidence: true },
  async run(context: ExtractorRuntimeContext) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const sites = context.selectedSources.filter(isJobSpySite);
    const countries = parseCountriesList(context.settings.jobspyCountryIndeed);
    // When the user pinned no country at all, run once with "no country" — the
    // existing single-run behaviour.  Otherwise loop once per country so each
    // gets its own Indeed/Glassdoor anchor and LinkedIn location proxy.
    const runCountries: Array<string | undefined> =
      countries.length === 0 ? [undefined] : countries;

    const totalRuns = runCountries.length;

    // Run all countries in parallel (up to JOBSPY_COUNTRY_CONCURRENCY at a
    // time).  Previously this loop was sequential, which made discovery
    // O(countries × terms × per-site-latency) — typically 1.5-2 hours when
    // 9 countries × 35 terms were combined.  Parallel cuts that to the time
    // of the slowest country.
    const perCountryResults = await runCountriesInParallel(
      runCountries,
      JOBSPY_COUNTRY_CONCURRENCY,
      async (country, i) => {
        if (context.shouldCancel?.()) {
          return { success: true as const, jobs: [] as CreateJobInput[] };
        }
        const countryLabel = country ?? "anywhere";

        return runJobSpy({
          sites,
          searchTerms: context.searchTerms,
          location:
            context.settings.searchCities ?? context.settings.jobspyLocation,
          resultsWanted: context.settings.jobspyResultsWanted
            ? parseInt(context.settings.jobspyResultsWanted, 10)
            : undefined,
          countryIndeed: country,
          workplaceTypes: context.settings.workplaceTypes
            ? JSON.parse(context.settings.workplaceTypes)
            : undefined,
          onProgress: (event) => {
            if (context.shouldCancel?.()) return;
            if (event.type === "term_start") {
              context.onProgress?.({
                phase: "list",
                termsProcessed: Math.max(event.termIndex - 1, 0),
                termsTotal: event.termTotal,
                currentUrl: event.searchTerm,
                detail: `JobSpy [${countryLabel}] ${i + 1}/${totalRuns}: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
              });
              return;
            }
            context.onProgress?.({
              phase: "list",
              termsProcessed: event.termIndex,
              termsTotal: event.termTotal,
              currentUrl: event.searchTerm,
              detail: `JobSpy [${countryLabel}] ${i + 1}/${totalRuns}: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm}) with ${event.jobsFoundTerm} jobs`,
            });
          },
        });
      },
      context.shouldCancel,
    );

    // Aggregate after all countries finish.  Dedup by jobUrl across countries
    // — the same posting frequently appears under multiple country anchors.
    const aggregatedJobs: CreateJobInput[] = [];
    const seenUrls = new Set<string>();
    let firstError: string | undefined;
    for (const result of perCountryResults) {
      if (!result) continue;
      if (!result.success) {
        if (!firstError) firstError = result.error;
        continue;
      }
      for (const job of result.jobs) {
        if (seenUrls.has(job.jobUrl)) continue;
        seenUrls.add(job.jobUrl);
        aggregatedJobs.push(job);
      }
    }

    // All countries failed → surface error. Otherwise return what we got.
    if (aggregatedJobs.length === 0 && firstError) {
      return { success: false, jobs: [], error: firstError };
    }

    return { success: true, jobs: aggregatedJobs };
  },
};

export default manifest;

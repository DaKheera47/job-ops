import { resolveSearchCities } from "@shared/search-cities.js";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import { runHiringCafe } from "./src/run";

type HiringCafeContext = Parameters<ExtractorManifest["run"]>[0];

function parseWorkplaceTypes(
  raw: string | undefined,
): Array<"remote" | "hybrid" | "onsite"> | undefined {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter(
      (value): value is "remote" | "hybrid" | "onsite" =>
        value === "remote" || value === "hybrid" || value === "onsite",
    );
  } catch {
    return undefined;
  }
}

function resolveContextCountry(context: HiringCafeContext): string {
  return (
    context.sourceLocationPlan?.requestedCountry ??
    context.locationIntent?.selectedCountry ??
    context.selectedCountry
  );
}

function resolveContextLocations(context: HiringCafeContext): string[] {
  return resolveSearchCities({
    list:
      context.sourceLocationPlan?.requestedCities ??
      context.locationIntent?.cityLocations,
    single: context.settings.searchCities ?? context.settings.jobspyLocation,
  });
}

function resolveContextWorkplaceTypes(
  context: HiringCafeContext,
): Array<"remote" | "hybrid" | "onsite"> | undefined {
  const intentTypes = context.locationIntent?.workplaceTypes;
  if (intentTypes && intentTypes.length > 0) {
    return [...intentTypes];
  }

  return parseWorkplaceTypes(context.settings.workplaceTypes);
}

function toProgress(event: {
  type: string;
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  pageNo?: number;
  totalCollected?: number;
}): ExtractorProgressEvent {
  if (event.type === "term_start") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      currentUrl: event.searchTerm,
      detail: `Hiring Cafe: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
    };
  }

  if (event.type === "page_fetched") {
    const pageNo = (event.pageNo ?? 0) + 1;
    const totalCollected = event.totalCollected ?? 0;
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      listPagesProcessed: pageNo,
      jobPagesEnqueued: totalCollected,
      jobPagesProcessed: totalCollected,
      currentUrl: `page ${pageNo}`,
      detail: `Hiring Cafe: term ${event.termIndex}/${event.termTotal}, page ${pageNo} (${totalCollected} collected)`,
    };
  }

  return {
    phase: "list",
    termsProcessed: event.termIndex,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    detail: `Hiring Cafe: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
  };
}

export const manifest: ExtractorManifest = {
  id: "hiringcafe",
  displayName: "Hiring Cafe",
  providesSources: ["hiringcafe"],
  capabilities: { locationEvidence: true },
  async run(context) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const maxJobsPerTerm = context.settings.jobspyResultsWanted
      ? parseInt(context.settings.jobspyResultsWanted, 10)
      : 200;

    const country = resolveContextCountry(context);

    const result = await runHiringCafe({
      country,
      countryKey: country,
      searchTerms: context.searchTerms,
      locations: resolveContextLocations(context),
      workplaceTypes: resolveContextWorkplaceTypes(context),
      maxJobsPerTerm,
      shouldCancel: context.shouldCancel,
      onProgress: (event) => {
        if (context.shouldCancel?.()) return;

        context.onProgress?.(toProgress(event));
      },
    });

    if (!result.success) {
      return {
        success: false,
        jobs: [],
        error: result.error,
        challengeRequired: result.challengeRequired,
      };
    }

    return {
      success: true,
      jobs: result.jobs,
    };
  },
};

export default manifest;

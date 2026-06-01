import { logger } from "@infra/logger";
import * as settingsRepo from "@server/repositories/settings";
import { normalizeSearchTerms } from "@shared/utils/search-terms";
import { suggestOnboardingSearchTerms } from "./onboarding-search-terms";

type EnsurePipelineSearchTermsResult = {
  searchTermsCount: number | null;
  source: "request" | "existing" | "generated" | "unavailable";
};

function parseStoredSearchTerms(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? normalizeSearchTerms(
          parsed.filter((value): value is string => typeof value === "string"),
        )
      : [];
  } catch {
    return [];
  }
}

async function persistSearchTerms(searchTerms: string[]): Promise<void> {
  await settingsRepo.setSetting("searchTerms", JSON.stringify(searchTerms));
}

export async function ensurePipelineSearchTerms(args: {
  requestedSearchTerms?: string[] | null;
}): Promise<EnsurePipelineSearchTermsResult> {
  const requestedTerms = normalizeSearchTerms(args.requestedSearchTerms ?? []);
  if (requestedTerms.length > 0) {
    await persistSearchTerms(requestedTerms);
    return {
      searchTermsCount: requestedTerms.length,
      source: "request",
    };
  }

  const storedTerms = parseStoredSearchTerms(
    await settingsRepo.getSetting("searchTerms"),
  );
  if (storedTerms.length > 0) {
    return {
      searchTermsCount: storedTerms.length,
      source: "existing",
    };
  }

  try {
    const generated = await suggestOnboardingSearchTerms();
    const generatedTerms = normalizeSearchTerms(generated.terms);
    if (generatedTerms.length === 0) {
      return {
        searchTermsCount: null,
        source: "unavailable",
      };
    }

    await persistSearchTerms(generatedTerms);
    return {
      searchTermsCount: generatedTerms.length,
      source: "generated",
    };
  } catch (error) {
    logger.warn("Pipeline search terms could not be generated before run", {
      route: "POST /api/pipeline/run",
      error,
    });
    return {
      searchTermsCount: null,
      source: "unavailable",
    };
  }
}

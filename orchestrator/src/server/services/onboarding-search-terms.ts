import { conflict } from "@infra/errors";
import { logger } from "@infra/logger";
import { resolveLlmModel } from "@server/services/modelSelection";
import type {
  ResumeProfile,
  SearchTermsSuggestionResponse,
} from "@shared/types";
import {
  MAX_SEARCH_TERM_LENGTH,
  MAX_SEARCH_TERMS,
  normalizeSearchTerms,
} from "@shared/utils/search-terms";
import { LlmService } from "./llm/service";
import type { JsonSchemaDefinition } from "./llm/types";
import { getProfile } from "./profile";

type SearchTermSuggestionModelResponse = {
  terms: string[];
};

type SearchTermContext = {
  headline: string;
  summary: string;
  experiencePositions: string[];
  projectNames: string[];
  projectKeywords: string[];
  skillNames: string[];
  skillKeywords: string[];
};

const SEARCH_TERMS_SCHEMA: JsonSchemaDefinition = {
  name: "onboarding_search_terms",
  schema: {
    type: "object",
    properties: {
      terms: {
        type: "array",
        description: "Concise job-title search terms derived from the resume",
        items: {
          type: "string",
        },
        minItems: 1,
        maxItems: MAX_SEARCH_TERMS,
      },
    },
    required: ["terms"],
    additionalProperties: false,
  },
};

function isVisible(value: { visible?: boolean } | null | undefined): boolean {
  return value?.visible !== false;
}

function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupe(values: string[], maxItems = MAX_SEARCH_TERMS): string[] {
  return normalizeSearchTerms(values, {
    maxTerms: maxItems,
    maxLength: MAX_SEARCH_TERM_LENGTH,
  });
}

function collectContext(profile: ResumeProfile): SearchTermContext {
  const experienceItems =
    profile.sections?.experience?.items?.filter((item) => isVisible(item)) ??
    [];
  const projectItems =
    profile.sections?.projects?.items?.filter((item) => isVisible(item)) ?? [];
  const skillItems =
    profile.sections?.skills?.items?.filter((item) => isVisible(item)) ?? [];

  return {
    headline: toTrimmed(profile.basics?.headline || profile.basics?.label),
    summary: toTrimmed(
      profile.basics?.summary || profile.sections?.summary?.content,
    ),
    experiencePositions: dedupe(
      experienceItems.map((item) => toTrimmed(item.position)),
      12,
    ),
    projectNames: dedupe(
      projectItems.map((item) => toTrimmed(item.name)),
      12,
    ),
    projectKeywords: dedupe(
      projectItems.flatMap((item) => item.keywords ?? []).map(toTrimmed),
      20,
    ),
    skillNames: dedupe(
      skillItems.map((item) => toTrimmed(item.name)),
      20,
    ),
    skillKeywords: dedupe(
      skillItems.flatMap((item) => item.keywords ?? []).map(toTrimmed),
      30,
    ),
  };
}

function hasUsableContext(context: SearchTermContext): boolean {
  return Boolean(
    context.headline ||
      context.summary ||
      context.experiencePositions.length > 0 ||
      context.projectNames.length > 0 ||
      context.projectKeywords.length > 0 ||
      context.skillNames.length > 0 ||
      context.skillKeywords.length > 0,
  );
}

export function buildFallbackSearchTerms(
  profile: ResumeProfile,
): SearchTermsSuggestionResponse {
  const context = collectContext(profile);

  return {
    terms: dedupe([
      context.headline,
      ...context.experiencePositions,
      ...context.projectNames,
      ...context.skillNames,
      ...context.projectKeywords,
      ...context.skillKeywords,
      // Summary is a last resort so AI failures still return something
      // deterministic for resumes that lack explicit title-like fields.
      context.summary,
    ]),
    source: "fallback",
  };
}

function buildPrompt(context: SearchTermContext): string {
  return [
    "Suggest 5 to 8 concise job-title search terms for a job seeker based on this resume snapshot.",
    "Return only job-title-style phrases that work well on job boards.",
    "Rules:",
    "- Keep each term short and specific.",
    "- Use common title phrasing employers actually post.",
    "- Do not include locations, company names, salaries, Boolean operators, or explanations.",
    "- Do not return duplicate or near-duplicate terms.",
    "- Stay grounded in the resume evidence.",
    "",
    "Resume snapshot:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

export async function suggestOnboardingSearchTerms(): Promise<SearchTermsSuggestionResponse> {
  let profile: ResumeProfile;

  try {
    profile = await getProfile();
  } catch (error) {
    logger.warn(
      "Onboarding search-term suggestion skipped because no resume is available",
      {
        route: "POST /api/onboarding/search-terms/suggest",
        error,
      },
    );
    throw conflict("Resume must be configured before suggesting search terms.");
  }

  const context = collectContext(profile);
  if (!hasUsableContext(context)) {
    logger.warn(
      "Onboarding search-term suggestion skipped because resume context was empty",
      {
        route: "POST /api/onboarding/search-terms/suggest",
      },
    );
    throw conflict("Resume must be configured before suggesting search terms.");
  }

  const fallback = buildFallbackSearchTerms(profile);

  try {
    const model = await resolveLlmModel("tailoring");
    const llm = new LlmService();
    const result = await llm.callJson<SearchTermSuggestionModelResponse>({
      model,
      messages: [{ role: "user", content: buildPrompt(context) }],
      jsonSchema: SEARCH_TERMS_SCHEMA,
    });

    if (!result.success) {
      logger.warn(
        "Onboarding search-term suggestion fell back after AI generation failed",
        {
          route: "POST /api/onboarding/search-terms/suggest",
          error: result.error,
          fallbackTermsCount: fallback.terms.length,
        },
      );
      if (fallback.terms.length > 0) return fallback;
      throw conflict(
        "Resume must be configured before suggesting search terms.",
      );
    }

    const terms = dedupe(result.data?.terms ?? []);
    if (terms.length === 0) {
      logger.warn(
        "Onboarding search-term suggestion produced no usable AI terms",
        {
          route: "POST /api/onboarding/search-terms/suggest",
          fallbackTermsCount: fallback.terms.length,
        },
      );
      if (fallback.terms.length > 0) return fallback;
      throw conflict(
        "Resume must be configured before suggesting search terms.",
      );
    }

    return {
      terms,
      source: "ai",
    };
  } catch (error) {
    logger.warn(
      "Onboarding search-term suggestion fell back after unexpected generation error",
      {
        route: "POST /api/onboarding/search-terms/suggest",
        error,
        fallbackTermsCount: fallback.terms.length,
      },
    );
    if (fallback.terms.length > 0) return fallback;
    throw conflict("Resume must be configured before suggesting search terms.");
  }
}

/**
 * Service for generating source-linked tailored resume content.
 */

import { logger } from "@infra/logger";
import type { ResumeProfile } from "@shared/types";
import { stripHtmlTags } from "@shared/utils/string";
import type { JsonSchemaDefinition } from "./llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import {
  getWritingLanguageLabel,
  resolveWritingOutputLanguage,
} from "./output-language";
import {
  getEffectivePromptTemplate,
  renderPromptTemplate,
} from "./prompt-templates";
import {
  extractTailoringSource,
  type FullTailoredData,
  validateTailoringData,
} from "./tailored-resume";
import {
  getWritingStyle,
  stripKeywordLimitFromConstraints,
  stripLanguageDirectivesFromConstraints,
  stripWordLimitFromConstraints,
} from "./writing-style";

export type TailoredData = FullTailoredData;

export interface TailoringResult {
  success: boolean;
  data?: TailoredData;
  error?: string;
}

const SOURCE_LINKED_REWRITES_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      bullets: { type: "array", items: { type: "string" } },
    },
    required: ["id", "bullets"],
    additionalProperties: false,
  },
};

/** JSON schema for resume tailoring response */
const TAILORING_SCHEMA: JsonSchemaDefinition = {
  name: "resume_tailoring",
  schema: {
    type: "object",
    properties: {
      headline: {
        type: "string",
        description: "Job title headline matching the JD exactly",
      },
      summary: {
        type: "string",
        description: "Tailored resume summary paragraph",
      },
      skills: {
        type: "array",
        description: "Skills sections with keywords tailored to the job",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Skill category name (e.g., Frontend, Backend)",
            },
            keywords: {
              type: "array",
              items: { type: "string" },
              description: "List of skills/technologies in this category",
            },
          },
          required: ["name", "keywords"],
          additionalProperties: false,
        },
      },
      experience: SOURCE_LINKED_REWRITES_SCHEMA,
      projects: SOURCE_LINKED_REWRITES_SCHEMA,
    },
    required: ["headline", "summary", "skills", "experience", "projects"],
    additionalProperties: false,
  },
};

/**
 * Generate all source-linked tailored resume fields for a job.
 */
export async function generateTailoring(
  jobDescription: string,
  profile: ResumeProfile,
): Promise<TailoringResult> {
  const [model, writingStyle] = await Promise.all([
    resolveLlmModel("tailoring"),
    getWritingStyle(),
  ]);
  const prompt = await buildTailoringPrompt(
    profile,
    jobDescription,
    writingStyle,
  );

  const llm = await createConfiguredLlmService("tailoring");
  const result = await llm.callJson<unknown>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: TAILORING_SCHEMA,
  });

  if (!result.success) {
    const context = `provider=${llm.getProvider()} baseUrl=${llm.getBaseUrl()}`;
    if (result.error.toLowerCase().includes("api key")) {
      const message = `LLM API key not set, cannot generate tailoring. (${context})`;
      logger.warn(message);
      return { success: false, error: message };
    }
    return {
      success: false,
      error: `${result.error} (${context})`,
    };
  }

  const validated = validateTailoringData(result.data, profile);
  if (!validated.data) {
    logger.warn("AI response failed source-linked tailoring validation", {
      error: validated.error,
    });
    return { success: false, error: validated.error };
  }

  return { success: true, data: validated.data };
}

/**
 * Backwards compatibility wrapper if needed, or alias.
 */
export async function generateSummary(
  jobDescription: string,
  profile: ResumeProfile,
): Promise<{ success: boolean; summary?: string; error?: string }> {
  // If we just need summary, we can discard the rest (or cache it? but here we just return summary)
  const result = await generateTailoring(jobDescription, profile);
  return {
    success: result.success,
    summary: result.data?.summary,
    error: result.error,
  };
}

async function buildTailoringPrompt(
  profile: ResumeProfile,
  jd: string,
  writingStyle: Awaited<ReturnType<typeof getWritingStyle>>,
): Promise<string> {
  const jobDescription = stripHtmlTags(jd);
  const resolvedLanguage = resolveWritingOutputLanguage({
    style: writingStyle,
    profile,
    jobDescription,
  });
  const outputLanguage = getWritingLanguageLabel(resolvedLanguage.language);
  let effectiveConstraints = stripLanguageDirectivesFromConstraints(
    writingStyle.constraints,
  );
  if (writingStyle.summaryMaxWords != null) {
    effectiveConstraints = stripWordLimitFromConstraints(effectiveConstraints);
  }
  if (writingStyle.maxKeywordsPerSkill != null) {
    effectiveConstraints =
      stripKeywordLimitFromConstraints(effectiveConstraints);
  }

  const relevantProfile = extractTailoringSource(profile);
  const template = await getEffectivePromptTemplate("tailoringPromptTemplate");

  const rendered = renderPromptTemplate(template, {
    jobDescription,
    profileJson: JSON.stringify(relevantProfile),
    outputLanguage,
    tone: writingStyle.tone,
    formality: writingStyle.formality,
    summaryMaxWordsLine:
      writingStyle.summaryMaxWords != null
        ? ` Maximum ${writingStyle.summaryMaxWords} ${writingStyle.summaryMaxWords === 1 ? "word" : "words"}.`
        : "",
    maxKeywordsPerSkillLine:
      writingStyle.maxKeywordsPerSkill != null
        ? `\n   - Maximum ${writingStyle.maxKeywordsPerSkill} ${writingStyle.maxKeywordsPerSkill === 1 ? "keyword" : "keywords"} per category. If a category has more, keep only the most JD-relevant ones.`
        : "",
    constraintsBullet: effectiveConstraints
      ? `- Additional constraints: ${effectiveConstraints}`
      : "",
    avoidTermsBullet: writingStyle.doNotUse
      ? `- Avoid these words or phrases: ${writingStyle.doNotUse}`
      : "",
  });

  return `${rendered}

SOURCE-LINKED CLAIM SAFETY (mandatory):
- Return all five fields: headline, summary, skills, experience, and projects.
- For experience and projects, use only IDs present in MY PROFILE.
- Each bullet may use evidence only from that same source item. Never transfer facts between roles or projects.
- Do not add employers, titles, tools, metrics, scale, ownership, outcomes, or production maturity absent from that source item.
- Preserve qualifiers such as prototype, pilot, contributor, collaboration, and ongoing work.
- Do not introduce a numerical token unless it appears in that same source item.
- Return plain-text bullets; do not return HTML or Markdown.`;
}

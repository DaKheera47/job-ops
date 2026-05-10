import { logger } from "@infra/logger";
import type { Job, ResumeProfile } from "@shared/types";
import type { JsonSchemaDefinition } from "./llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import {
  getWritingLanguageLabel,
  resolveWritingOutputLanguage,
} from "./output-language";
import { getWritingStyle } from "./writing-style";

const coverLetterLogger = logger.child({ module: "cover-letter" });

const COVER_LETTER_SCHEMA: JsonSchemaDefinition = {
  name: "cover_letter",
  schema: {
    type: "object",
    properties: {
      coverLetter: {
        type: "string",
        description:
          "Cover letter body, 250-300 words, plain text, paragraphs separated by a single blank line. No salutation, no signature line.",
      },
    },
    required: ["coverLetter"],
    additionalProperties: false,
  },
};

export interface CoverLetterResult {
  success: boolean;
  text?: string;
  error?: string;
}

export async function generateCoverLetter(
  job: Job,
  profile: ResumeProfile,
): Promise<CoverLetterResult> {
  const jd = (job.jobDescription ?? "").trim();
  if (!jd) {
    return {
      success: false,
      error: "Job has no description to generate a cover letter from",
    };
  }

  const [model, writingStyle] = await Promise.all([
    resolveLlmModel("tailoring"),
    getWritingStyle(),
  ]);

  const resolvedLanguage = resolveWritingOutputLanguage({
    style: writingStyle,
    profile,
  });
  const outputLanguage = getWritingLanguageLabel(resolvedLanguage.language);

  const prompt = buildPrompt({
    job,
    profile,
    outputLanguage,
    tone: writingStyle.tone,
    formality: writingStyle.formality,
    avoidWords: writingStyle.doNotUse ?? "",
  });

  const llm = await createConfiguredLlmService();
  const result = await llm.callJson<{ coverLetter: string }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: COVER_LETTER_SCHEMA,
  });

  if (!result.success) {
    coverLetterLogger.warn("Cover letter LLM call failed", {
      error: result.error,
    });
    return { success: false, error: result.error };
  }

  const text = (result.data.coverLetter ?? "").trim();
  if (!text || text.length < 100) {
    return { success: false, error: "Cover letter response too short" };
  }

  return { success: true, text: sanitize(text) };
}

function buildPrompt(args: {
  job: Job;
  profile: ResumeProfile;
  outputLanguage: string;
  tone: string;
  formality: string;
  avoidWords: string;
}): string {
  const { job, profile, outputLanguage, tone, formality, avoidWords } = args;

  const profileSummary = {
    name: profile.basics?.name,
    headline: profile.basics?.label,
    summary: profile.basics?.summary,
    skills:
      profile.sections?.skills?.items?.map((s) => ({
        name: s.name,
        keywords: s.keywords,
      })) ?? [],
    projects:
      profile.sections?.projects?.items?.map((p) => ({
        name: p.name,
        description: p.description,
        keywords: p.keywords,
      })) ?? [],
    experience:
      profile.sections?.experience?.items?.map((e) => ({
        company: e.company,
        position: e.position,
        summary: e.summary,
      })) ?? [],
  };

  return [
    "You are writing a cover letter for a specific job application. Your goal: maximize response rate by being concrete and company-specific.",
    "",
    "Hard requirements:",
    `- Output language: ${outputLanguage}.`,
    `- Length: 250-300 words. Three or four short paragraphs separated by a single blank line.`,
    `- Tone: ${tone}. Formality: ${formality}.`,
    "- DO NOT include any salutation (no 'Dear...'), no signature, no contact info, no address block. Body paragraphs only.",
    "- Reference at least two specific details from the JD: the product, the team's mission, the tech stack, or a stated challenge. Show that you actually read it.",
    "- Map at least two concrete items from the candidate profile (a project, a skill cluster, or an experience) to specific requirements in the JD.",
    "- Plain text only. No markdown, no bullet lists, no bold, no emojis.",
    `- Banned phrases (do not use any of these): "passionate about", "results-oriented", "team player", "go-getter", "synergy", "I am writing to apply for", "thrilled", "proven track record".`,
    avoidWords ? `- Also avoid these words/phrases: ${avoidWords}` : "",
    "- Avoid generic filler. Every sentence should be falsifiable — i.e., it would not equally apply to a different applicant or a different company.",
    "",
    "Job description:",
    "---",
    job.jobDescription ?? "",
    "---",
    "",
    `Company: ${job.employer}`,
    `Role: ${job.title}`,
    "",
    "Candidate profile (JSON):",
    "---",
    JSON.stringify(profileSummary, null, 2),
    "---",
    "",
    "Return JSON with a single field 'coverLetter' containing the body text.",
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitize(text: string): string {
  return text
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

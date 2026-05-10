import { logger } from "@infra/logger";
import type { Job, ResumeProfile } from "@shared/types";
import type { JsonSchemaDefinition } from "./llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import {
  getWritingLanguageLabel,
  resolveWritingOutputLanguage,
} from "./output-language";
import { getProfile } from "./profile";
import { getWritingStyle } from "./writing-style";

const referralMessageLogger = logger.child({ module: "referral-message" });

const REFERRAL_SCHEMA: JsonSchemaDefinition = {
  name: "referral_message",
  schema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description:
          "LinkedIn referral request message addressed to '[Name]'. Concrete, polite, ~120-160 words.",
      },
    },
    required: ["message"],
    additionalProperties: false,
  },
};

export interface ReferralMessageResult {
  success: boolean;
  text?: string;
  error?: string;
}

export async function generateReferralMessage(
  job: Job,
): Promise<ReferralMessageResult> {
  const profile = await getProfile();

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
  const result = await llm.callJson<{ message: string }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: REFERRAL_SCHEMA,
  });

  if (!result.success) {
    referralMessageLogger.warn("Referral message LLM call failed", {
      error: result.error,
    });
    return { success: false, error: result.error };
  }

  const text = (result.data.message ?? "").trim();
  if (!text || text.length < 60) {
    return { success: false, error: "Referral message response too short" };
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
    experience:
      profile.sections?.experience?.items?.map((e) => ({
        company: e.company,
        position: e.position,
        summary: e.summary,
      })) ?? [],
  };

  const link = job.applicationLink || job.jobUrl || "";

  return [
    "You are writing a short LinkedIn message that the candidate will send to a current employee at the target company to ask for a referral.",
    "Goal: get a referral so the candidate can bypass the ATS filter. Be concrete, respectful, and easy to say yes to.",
    "",
    "Hard requirements:",
    `- Output language: ${outputLanguage}.`,
    `- Tone: ${tone}. Formality: ${formality}.`,
    "- Open with exactly: 'Hi [Name],' — keep '[Name]' as a literal placeholder. Do NOT guess a real name.",
    `- Mention the role title and the company by name. Include the job link on its own.`,
    "- One short paragraph that maps 2-3 specific items from the candidate profile (years of experience, domain, concrete skills/projects) to what the role asks for. Be falsifiable — would not equally apply to other applicants.",
    "- One short paragraph that politely asks the recipient — since they already work there — whether the description matches what the team actually needs, and asks for advice or a possible referral before applying through the standard process.",
    "- Close with 'Best regards,' on its own line followed by the candidate's first name (or full name if no first name is set).",
    "- Length target: 120-160 words across 3-4 short paragraphs separated by single blank lines.",
    "- Plain text only. No markdown, no bullet lists, no emojis, no signatures with title/contacts.",
    `- Banned phrases (do not use): "passionate about", "results-oriented", "team player", "synergy", "I am writing to apply", "thrilled", "proven track record", "kindly".`,
    avoidWords ? `- Also avoid: ${avoidWords}` : "",
    "",
    "Reference example of the desired structure (do not copy wording, write fresh content tied to THIS job and profile):",
    "---",
    "Hi [Name],",
    "",
    "I'm reaching out regarding the {role} role at {company}: {link}",
    "",
    "My experience appears highly aligned — {2-3 concrete points mapped from the candidate profile to specific JD requirements}.",
    "",
    "Since you're already at {company}, I wanted to ask whether this matches what the team is currently looking for. If so, I'd really appreciate your advice or a possible referral before I submit through the standard application process.",
    "",
    "Best regards,",
    "{first name}",
    "---",
    "",
    `Company: ${job.employer}`,
    `Role: ${job.title ?? ""}`,
    `Job link: ${link}`,
    "",
    "Job description:",
    "---",
    job.jobDescription ?? "",
    "---",
    "",
    "Candidate profile (JSON):",
    "---",
    JSON.stringify(profileSummary, null, 2),
    "---",
    "",
    "Return JSON with a single field 'message' containing the full text starting with 'Hi [Name],' and ending with the candidate's name on the last line.",
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

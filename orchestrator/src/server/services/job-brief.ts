import { logger } from "@infra/logger";
import type { JobBrief } from "@shared/types";
import type { JsonSchemaDefinition } from "./llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";

const SYSTEM_PROMPT = `
You are extracting a concise job brief from a job description for a job search app.

Your job is NOT to judge whether the candidate is a good fit.
Your job is NOT to give career advice.
Your job is NOT to rewrite the job description in marketing language.

Your job is to remove fluff and extract what the JD actually says.

Rules:
- Only use information present in the job description.
- Do not infer candidate fit.
- Do not mention the candidate.
- Do not invent missing details.
- If something is not stated, write "Not stated".
- Keep outputs short and glanceable.
- Prefer concrete specifics over generic wording.
- Remove employer branding fluff unless it describes actual benefits, working style, product, or team context.
- Use neutral language.
- Return valid JSON only.
`.trim();

const stringList = (description: string, maxItems: number) => ({
  type: "array",
  description,
  maxItems,
  items: { type: "string" },
});

const JOB_BRIEF_SCHEMA: JsonSchemaDefinition = {
  name: "job_brief",
  schema: {
    type: "object",
    properties: {
      role_summary: {
        type: "string",
        description:
          "One sentence summarizing what the person would actually do.",
      },
      they_want: stringList("Stated applicant requirements only", 6),
      specifics: stringList("Named concrete specifics from the JD", 18),
      company_offers: stringList(
        "Concrete things the company says it offers",
        5,
      ),
      practical_details: stringList(
        "Concise key-value strings such as 'Salary: Not stated'",
        8,
      ),
      missing_or_unclear: stringList(
        "Important details not clearly stated in the JD",
        5,
      ),
      repeated_signals: stringList("Repeated themes emphasized by the JD", 5),
    },
    required: [
      "role_summary",
      "they_want",
      "specifics",
      "company_offers",
      "practical_details",
      "missing_or_unclear",
      "repeated_signals",
    ],
    additionalProperties: false,
  },
};

export async function generateJobBrief(
  jobDescription: string | null | undefined,
  context: { jobId?: string } = {},
): Promise<string | null> {
  const description = jobDescription?.trim();
  if (!description) return null;

  try {
    const model = await resolveLlmModel("scoring");
    const llm = await createConfiguredLlmService();
    const result = await llm.callJson<JobBrief>({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(description) },
      ],
      jsonSchema: JOB_BRIEF_SCHEMA,
      maxRetries: 2,
      jobId: context.jobId,
    });

    if (!result.success) {
      logger.warn("Job brief extraction failed", {
        jobId: context.jobId,
        error: result.error,
      });
      return null;
    }

    const brief = normalizeJobBrief(result.data);
    if (!brief) {
      logger.warn("Job brief extraction returned invalid shape", {
        jobId: context.jobId,
      });
      return null;
    }

    return JSON.stringify(brief);
  } catch (error) {
    logger.warn("Job brief extraction failed", {
      jobId: context.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function buildUserPrompt(jobDescription: string): string {
  return `
Extract a concise, no-BS job brief from this job description.

Return JSON in this exact shape:
{
  "role_summary": "",
  "they_want": [],
  "specifics": [],
  "company_offers": [],
  "practical_details": [],
  "missing_or_unclear": [],
  "repeated_signals": []
}

Rules for fields:
- role_summary: one sentence describing what the person would actually do.
- they_want: maximum 6 short bullets for stated requirements only.
- specifics: maximum 18 short chips for concrete tools, technologies, responsibilities, domain, collaboration points, locations, or working pattern.
- company_offers: maximum 5 short bullets for concrete things the company claims to provide.
- practical_details: maximum 8 strings formatted like "Salary: Not stated", covering title, company, level, location, remote/hybrid, salary, sponsorship/right to work, contract type, deadline, and application route where stated.
- missing_or_unclear: maximum 5 short bullets.
- repeated_signals: maximum 5 short chips.

Job description:
${jobDescription}
`.trim();
}

function normalizeJobBrief(value: JobBrief): JobBrief | null {
  if (!value || typeof value !== "object") return null;
  if (typeof value.role_summary !== "string") return null;

  return {
    role_summary: value.role_summary.trim() || "Not stated",
    they_want: normalizeStringList(value.they_want, 6),
    specifics: normalizeStringList(value.specifics, 18),
    company_offers: normalizeStringList(value.company_offers, 5),
    practical_details: normalizeStringList(value.practical_details, 8),
    missing_or_unclear: normalizeStringList(value.missing_or_unclear, 5),
    repeated_signals: normalizeStringList(value.repeated_signals, 5),
  };
}

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

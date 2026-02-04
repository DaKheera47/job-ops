/**
 * Service for inferring job details from a pasted job description.
 */

import { logger } from "@infra/logger";
import type { ManualJobDraft } from "@shared/types";
import { getSetting } from "../repositories/settings";
import { type JsonSchemaDefinition, LlmService } from "./llm-service";

export interface ManualJobInferenceResult {
  job: ManualJobDraft;
  warning?: string | null;
}

/** Raw response type from the API (all fields are strings) */
interface ManualJobApiResponse {
  title: string;
  employer: string;
  location: string;
  salary: string;
  deadline: string;
  jobUrl: string;
  applicationLink: string;
  jobType: string;
  jobLevel: string;
  jobFunction: string;
  disciplines: string;
  degreeRequired: string;
  starting: string;
  jobDescription: string;
}

/** JSON schema for manual job extraction response */
const MANUAL_JOB_SCHEMA: JsonSchemaDefinition = {
  name: "manual_job_details",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Job title" },
      employer: { type: "string", description: "Company/employer name" },
      location: { type: "string", description: "Job location" },
      salary: { type: "string", description: "Salary information" },
      deadline: { type: "string", description: "Application deadline" },
      jobUrl: { type: "string", description: "URL of the job listing" },
      applicationLink: {
        type: "string",
        description: "Direct application URL",
      },
      jobType: {
        type: "string",
        description: "Employment type (full-time, part-time, etc.)",
      },
      jobLevel: {
        type: "string",
        description: "Seniority level (entry, mid, senior, etc.)",
      },
      jobFunction: { type: "string", description: "Job function/category" },
      disciplines: {
        type: "string",
        description: "Required disciplines or fields",
      },
      degreeRequired: {
        type: "string",
        description: "Required degree or education",
      },
      starting: { type: "string", description: "Start date information" },
      jobDescription: {
        type: "string",
        description:
          "Clean text job description with responsibilities and requirements",
      },
    },
    required: [
      "title",
      "employer",
      "location",
      "salary",
      "deadline",
      "jobUrl",
      "applicationLink",
      "jobType",
      "jobLevel",
      "jobFunction",
      "disciplines",
      "degreeRequired",
      "starting",
      "jobDescription",
    ],
    additionalProperties: false,
  },
};

export async function inferManualJobDetails(
  jobDescription: string,
): Promise<ManualJobInferenceResult> {
  const overrideModel = await getSetting("model");
  const model =
    overrideModel || process.env.MODEL || "google/gemini-3-flash-preview";
  const prompt = buildInferencePrompt(jobDescription);

  const llm = new LlmService();
  const result = await llm.callJson<ManualJobApiResponse>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: MANUAL_JOB_SCHEMA,
  });

  if (!result.success) {
    if (result.error.toLowerCase().includes("api key")) {
      return {
        job: {},
        warning: "LLM API key not set. Fill details manually.",
      };
    }
    logger.warn("Manual job inference failed", { error: result.error });
    return {
      job: {},
      warning: "AI inference failed. Fill details manually.",
    };
  }

  return { job: normalizeDraft(result.data) };
}

function buildInferencePrompt(jd: string): string {
  return `
You are extracting structured data from a job posting.
The input may be raw HTML from a job listing page or plain text - extract the relevant job information either way.
Return JSON only with the keys listed below. Use empty string if unknown.
Do not guess or invent data. Ignore navigation, headers, footers, and other non-job content.

Keys:
- title (job title)
- employer (company name)
- location (job location)
- salary (salary/compensation info)
- deadline (application deadline)
- jobUrl (the listing URL, if present in the content)
- applicationLink (the apply URL, if present)
- jobType (full-time, part-time, contract, etc.)
- jobLevel (entry, mid, senior, etc.)
- jobFunction (engineering, marketing, etc.)
- disciplines (required fields/disciplines)
- degreeRequired (required education)
- starting (start date)
- jobDescription (clean plain text of the job description including responsibilities and requirements - extract this from the HTML/content)

JOB POSTING CONTENT:
${jd}

OUTPUT FORMAT (JSON ONLY):
{
  "title": "",
  "employer": "",
  "location": "",
  "salary": "",
  "deadline": "",
  "jobUrl": "",
  "applicationLink": "",
  "jobType": "",
  "jobLevel": "",
  "jobFunction": "",
  "disciplines": "",
  "degreeRequired": "",
  "starting": "",
  "jobDescription": ""
}
`.trim();
}

function normalizeDraft(parsed: ManualJobApiResponse): ManualJobDraft {
  const out: ManualJobDraft = {};

  // Map each field, only including non-empty strings
  if (parsed.title?.trim()) out.title = parsed.title.trim();
  if (parsed.employer?.trim()) out.employer = parsed.employer.trim();
  if (parsed.location?.trim()) out.location = parsed.location.trim();
  if (parsed.salary?.trim()) out.salary = parsed.salary.trim();
  if (parsed.deadline?.trim()) out.deadline = parsed.deadline.trim();
  if (parsed.jobUrl?.trim()) out.jobUrl = parsed.jobUrl.trim();
  if (parsed.applicationLink?.trim())
    out.applicationLink = parsed.applicationLink.trim();
  if (parsed.jobType?.trim()) out.jobType = parsed.jobType.trim();
  if (parsed.jobLevel?.trim()) out.jobLevel = parsed.jobLevel.trim();
  if (parsed.jobFunction?.trim()) out.jobFunction = parsed.jobFunction.trim();
  if (parsed.disciplines?.trim()) out.disciplines = parsed.disciplines.trim();
  if (parsed.degreeRequired?.trim())
    out.degreeRequired = parsed.degreeRequired.trim();
  if (parsed.starting?.trim()) out.starting = parsed.starting.trim();
  if (parsed.jobDescription?.trim())
    out.jobDescription = parsed.jobDescription.trim();

  return out;
}

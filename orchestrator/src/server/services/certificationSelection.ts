/**
 * Service for AI-powered certification selection for resumes.
 */

import { stripHtmlTags } from "@shared/utils/string";
import { LlmService } from "./llm/service";
import type { JsonSchemaDefinition } from "./llm/types";
import { resolveLlmModel } from "./modelSelection";
import type {
  ResumeCertificationCatalogItem,
  ResumeCertificationSelectionItem,
  ResumeProfile,
} from "@shared/types";

/** JSON schema for certification selection response */
const CERTIFICATION_SELECTION_SCHEMA: JsonSchemaDefinition = {
  name: "certification_selection",
  schema: {
    type: "object",
    properties: {
      selectedCertificationIds: {
        type: "array",
        items: { type: "string" },
        description: "List of certification IDs to include on the resume",
      },
    },
    required: ["selectedCertificationIds"],
    additionalProperties: false,
  },
};

export async function pickCertificationIdsForJob(args: {
  jobDescription: string;
  eligibleCertifications: ResumeCertificationSelectionItem[];
  desiredCount: number;
}): Promise<string[]> {
  const desiredCount = Math.max(0, Math.floor(args.desiredCount));
  if (desiredCount === 0) return [];

  const eligibleIds = new Set(args.eligibleCertifications.map((c) => c.id));
  if (eligibleIds.size === 0) return [];

  const model = await resolveLlmModel("certificationSelection");

  const prompt = buildCertificationSelectionPrompt({
    jobDescription: args.jobDescription,
    certifications: args.eligibleCertifications,
    desiredCount,
  });

  const llm = new LlmService();
  const result = await llm.callJson<{ selectedCertificationIds: string[] }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: CERTIFICATION_SELECTION_SCHEMA,
  });

  if (!result.success) {
    return fallbackPickCertificationIds(
      args.jobDescription,
      args.eligibleCertifications,
      desiredCount,
    );
  }

  const selectedCertificationIds = Array.isArray(
    result.data?.selectedCertificationIds,
  )
    ? result.data.selectedCertificationIds
    : [];

  // Validate and dedupe the returned IDs
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of selectedCertificationIds) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed) continue;
    if (!eligibleIds.has(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
    if (unique.length >= desiredCount) break;
  }

  if (unique.length === 0) {
    return fallbackPickCertificationIds(
      args.jobDescription,
      args.eligibleCertifications,
      desiredCount,
    );
  }

  return unique;
}

function buildCertificationSelectionPrompt(args: {
  jobDescription: string;
  certifications: ResumeCertificationSelectionItem[];
  desiredCount: number;
}): string {
  const certifications = args.certifications.map((c) => ({
    id: c.id,
    title: c.title,
    issuer: c.issuer,
    date: c.date,
    summary: truncate(c.summaryText, 500),
  }));

  return `
You are selecting which certifications to include on a resume for a specific job.

Rules:
- Choose up to ${args.desiredCount} certification IDs.
- Only choose IDs from the provided list.
- Prefer certifications that strongly match the job description keywords/requirements.
- Prefer certifications from recognized providers or relevant to the industry.
- Do NOT invent certifications or skills.

Job description:
${args.jobDescription}

Candidate certifications (pick from these IDs only):
${JSON.stringify(certifications, null, 2)}

Respond with JSON only, in this exact shape:
{
  "selectedCertificationIds": ["id1", "id2"]
}
`.trim();
}

function fallbackPickCertificationIds(
  jobDescription: string,
  eligibleCertifications: ResumeCertificationSelectionItem[],
  desiredCount: number,
): string[] {
  const jd = (jobDescription || "").toLowerCase();

  const signals = [
    "aws",
    "azure",
    "gcp",
    "cloud",
    "kubernetes",
    "docker",
    "devops",
    "security",
    "cissp",
    "pmp",
    "agile",
    "scrum",
    "python",
    "java",
    "javascript",
    "typescript",
    "react",
    "node",
    "sql",
    "data",
    "machine learning",
    "ai",
    "ml",
    "linux",
    "network",
    "ccna",
    "itil",
  ];

  const activeSignals = signals.filter((s) => jd.includes(s));

  const scored = eligibleCertifications
    .map((c) => {
      const text = `${c.title} ${c.issuer} ${c.summaryText}`.toLowerCase();
      let score = 0;
      for (const signal of activeSignals) {
        if (text.includes(signal)) score += 5;
      }
      // Prefer more recent certifications (simple heuristic)
      if (/\b(202[3-9]|202[0-9])\b/.test(c.date)) score += 2;
      if (/\b(google|amazon|microsoft|oracle|cisco)\b/.test(text)) score += 1;
      return { id: c.id, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, desiredCount).map((s) => s.id);
}

function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars - 1).trimEnd()}…`;
}

export function extractCertificationsFromProfile(profile: ResumeProfile): {
  catalog: ResumeCertificationCatalogItem[];
  selectionItems: ResumeCertificationSelectionItem[];
} {
  const items = profile?.sections?.certifications?.items;
  if (!Array.isArray(items)) return { catalog: [], selectionItems: [] };

  const catalog: ResumeCertificationCatalogItem[] = [];
  const selectionItems: ResumeCertificationSelectionItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const id = item.id || "";
    if (!id) continue;

    const title = item.title || "";
    const issuer = item.issuer || "";
    const date = item.date || "";
    const isVisibleInBase = Boolean(item.visible);
    const description = item.description || "";
    const summaryText = stripHtmlTags(description);

    const base: ResumeCertificationCatalogItem = {
      id,
      title,
      issuer,
      date,
      isVisibleInBase,
    };
    catalog.push(base);
    selectionItems.push({ ...base, summaryText });
  }

  return { catalog, selectionItems };
}

export function buildDefaultResumeCertificationsSettings(
  catalog: ResumeCertificationCatalogItem[],
): {
  maxCertifications: number;
  lockedCertificationIds: string[];
  aiSelectableCertificationIds: string[];
} {
  const lockedCertificationIds = catalog
    .filter((c) => c.isVisibleInBase)
    .map((c) => c.id);
  const lockedSet = new Set(lockedCertificationIds);

  const aiSelectableCertificationIds = catalog
    .map((c) => c.id)
    .filter((id) => !lockedSet.has(id));

  const total = catalog.length;
  const preferredMax = Math.max(lockedCertificationIds.length, 3);
  const maxCertifications = total === 0 ? 0 : Math.min(total, preferredMax);

  return {
    maxCertifications,
    lockedCertificationIds,
    aiSelectableCertificationIds,
  };
}

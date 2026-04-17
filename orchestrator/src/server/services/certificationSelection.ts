/**
 * Service for AI-powered certification selection for resumes.
 */

import { stripHtmlTags } from "@shared/utils/string";
import { LlmService } from "./llm/service";
import type { JsonSchemaDefinition } from "./llm/types";
import { resolveLlmModel } from "./modelSelection";
import { logger } from "@infra/logger";
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
  logger.info("Certification selection started", {
    desiredCount,
    eligibleCount: args.eligibleCertifications.length,
  });

  if (desiredCount === 0) {
    logger.info("Certification selection skipped: desiredCount is 0");
    return [];
  }

  const eligibleIds = new Set(args.eligibleCertifications.map((c) => c.id));
  if (eligibleIds.size === 0) {
    logger.info("Certification selection skipped: no eligible certifications");
    return [];
  }

  const model = await resolveLlmModel("certificationSelection");
  logger.info("Certification selection: calling LLM", { model });

  const prompt = buildCertificationSelectionPrompt({
    jobDescription: args.jobDescription,
    certifications: args.eligibleCertifications,
    desiredCount,
  });

  logger.info("Certification selection: AI prompt", { prompt });

  const llm = new LlmService();
  const result = await llm.callJson<{ selectedCertificationIds: string[] }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: CERTIFICATION_SELECTION_SCHEMA,
  });

  logger.info("Certification selection: AI response", {
    success: result.success,
    data: result.data,
    error: result.error,
  });

  if (!result.success) {
    logger.warn("Certification selection: LLM call failed, using fallback", {
      error: result.error,
    });
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

  logger.info("Certification selection: LLM returned", {
    returnedCount: selectedCertificationIds.length,
    returnedIds: selectedCertificationIds,
  });

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

  logger.info("Certification selection: after validation", {
    uniqueCount: unique.length,
    uniqueIds: unique,
  });

  if (unique.length === 0) {
    logger.warn("Certification selection: no valid IDs after validation, using fallback");
    return fallbackPickCertificationIds(
      args.jobDescription,
      args.eligibleCertifications,
      desiredCount,
    );
  }

  logger.info("Certification selection completed", {
    finalCount: unique.length,
    finalIds: unique,
  });

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
  logger.info("Extracting certifications from profile", {
    hasProfile: !!profile,
    hasSections: !!profile?.sections,
    hasCertifications: !!profile?.sections?.certifications,
    certificationsKeys: profile?.sections?.certifications ? Object.keys(profile.sections.certifications) : [],
    certificationsItems: profile?.sections?.certifications?.items,
  });

  const items = profile?.sections?.certifications?.items;
  if (!Array.isArray(items)) {
    logger.warn("Certification extraction failed: items is not an array", {
      items,
      itemsType: typeof items,
    });
    return { catalog: [], selectionItems: [] };
  }

  logger.info("Certification extraction: found items", {
    itemsCount: items.length,
  });

  const catalog: ResumeCertificationCatalogItem[] = [];
  const selectionItems: ResumeCertificationSelectionItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const id = item.id || "";
    if (!id) continue;

    const title = item.title || "";
    const issuer = item.issuer || "";
    const date = item.date || "";
    const isVisibleInBase = !Boolean(item.hidden); // Inverted: hidden=false means visible
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

  logger.info("Certification extraction completed", {
    catalogCount: catalog.length,
    selectionItemsCount: selectionItems.length,
  });

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

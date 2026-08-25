import type { Job, UpdateJobInput } from "@shared/types";
import { normalizeWhitespace, stripHtmlTags } from "@shared/utils/string";
import { z } from "zod";

export const PATCHABLE_JOB_FIELDS = [
  "salary",
  "salaryMinAmount",
  "salaryMaxAmount",
  "salaryCurrency",
  "salaryInterval",
  "location",
  "isRemote",
  "workFromHomeType",
  "jobType",
  "jobLevel",
  "jobFunction",
  "disciplines",
  "degreeRequired",
  "skills",
  "experienceRange",
  "companyIndustry",
  "deadline",
  "starting",
  "vacancyCount",
] as const;

export type PatchableJobField = (typeof PATCHABLE_JOB_FIELDS)[number];

export type JobFactPatch = {
  field: string;
  value: unknown;
  confidence: string;
  evidence: string;
};

type AcceptedPatch = {
  field: PatchableJobField;
  previousValue: unknown;
  newValue: unknown;
  confidence: "high" | "medium";
  evidence: string;
};

type RejectedPatch = {
  field: string;
  reason: string;
};

const text = (max: number) => z.string().trim().min(1).max(max);
const nonNegativeNumber = z.number().finite().nonnegative().max(1_000_000_000);
const valueSchemas: Record<PatchableJobField, z.ZodType> = {
  salary: text(200),
  salaryMinAmount: nonNegativeNumber,
  salaryMaxAmount: nonNegativeNumber,
  salaryCurrency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/)),
  salaryInterval: z.enum(["hourly", "daily", "weekly", "monthly", "yearly"]),
  location: text(200),
  isRemote: z.boolean(),
  workFromHomeType: z.enum(["remote", "hybrid", "onsite"]),
  jobType: text(200),
  jobLevel: text(200),
  jobFunction: text(200),
  disciplines: text(1_000),
  degreeRequired: text(500),
  skills: text(5_000),
  experienceRange: text(500),
  companyIndustry: text(500),
  deadline: text(100),
  starting: text(100),
  vacancyCount: z.number().int().positive().max(1_000_000),
};

const patchSchema = z.object({
  field: z.string(),
  value: z.unknown(),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.string().trim().min(1).max(500),
});

function normalizeEvidence(value: string): string {
  return normalizeWhitespace(stripHtmlTags(value))
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function includesNumber(evidence: string, value: number): boolean {
  const compact = evidence.toLowerCase().replace(/,/g, "");
  if (
    new RegExp(`(^|\\D)${String(value).replace(".", "\\.")}($|\\D)`).test(
      compact,
    )
  ) {
    return true;
  }
  return value >= 1_000 && compact.includes(`${value / 1_000}k`);
}

function evidenceSupportsValue(
  field: PatchableJobField,
  value: unknown,
  evidence: string,
): boolean {
  const normalized = normalizeEvidence(evidence);
  switch (field) {
    case "salaryMinAmount":
    case "salaryMaxAmount":
    case "vacancyCount":
      return includesNumber(evidence, value as number);
    case "salaryCurrency": {
      const currency = value as string;
      if (currency === "GBP") return /£|\bgbp\b|\bpounds?\b/i.test(evidence);
      if (currency === "USD") return /\busd\b|\bus dollars?\b/i.test(evidence);
      if (currency === "EUR") return /€|\beur\b|\beuros?\b/i.test(evidence);
      return normalized.includes(currency.toLowerCase());
    }
    case "salaryInterval":
      return (
        {
          hourly: /\b(hour|hourly|hr)\b/i,
          daily: /\b(day|daily)\b/i,
          weekly: /\b(week|weekly)\b/i,
          monthly: /\b(month|monthly)\b/i,
          yearly: /\b(year|yearly|annual|annually|annum)\b/i,
        }[value as string]?.test(evidence) === true
      );
    case "isRemote":
      return value === true
        ? /\bremote\b/i.test(evidence)
        : /\b(onsite|on-site|office-based|work(?:ing)? (?:from|in) (?:the )?office)\b|(?:five|5).{0,20}(?:days?|week).{0,30}(?:in (?:the )?)?office/i.test(
            evidence,
          );
    case "workFromHomeType":
      return (
        {
          remote: /\bremote\b/i,
          hybrid:
            /\bhybrid\b|office.{0,30}(day|week)|(?:day|week).{0,30}office/i,
          onsite:
            /\b(onsite|on-site)\b|(?:five|5).{0,20}(day|week).{0,30}office/i,
        }[value as string]?.test(evidence) === true
      );
    default:
      return normalized.includes(normalizeEvidence(String(value)));
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left === "string" && typeof right === "string") {
    return normalizeEvidence(left) === normalizeEvidence(right);
  }
  return Object.is(left, right);
}

function isMissing(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

export function validateAndApplyJobPatches(
  job: Job,
  proposedPatches: unknown,
): {
  patchedJob: Job;
  updates: UpdateJobInput;
  accepted: AcceptedPatch[];
  rejected: RejectedPatch[];
} {
  const rawPatches = Array.isArray(proposedPatches) ? proposedPatches : [];
  const fieldCounts = new Map<string, number>();
  for (const patch of rawPatches) {
    if (patch && typeof patch === "object" && "field" in patch) {
      const field = String((patch as { field: unknown }).field);
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    }
  }

  const updates: Record<string, unknown> = {};
  let accepted: AcceptedPatch[] = [];
  const rejected: RejectedPatch[] = [];
  const listing = normalizeEvidence(job.jobDescription ?? "");

  for (const rawPatch of rawPatches) {
    const parsed = patchSchema.safeParse(rawPatch);
    if (!parsed.success) {
      rejected.push({ field: "unknown", reason: "invalid_patch_shape" });
      continue;
    }

    const { field, confidence, evidence } = parsed.data;
    if (!PATCHABLE_JOB_FIELDS.includes(field as PatchableJobField)) {
      rejected.push({ field, reason: "unsupported_or_protected_field" });
      continue;
    }
    if ((fieldCounts.get(field) ?? 0) > 1) {
      rejected.push({ field, reason: "duplicate_field" });
      continue;
    }
    if (confidence === "low") {
      rejected.push({ field, reason: "low_confidence" });
      continue;
    }

    const normalizedEvidence = normalizeEvidence(evidence);
    if (!normalizedEvidence || !listing.includes(normalizedEvidence)) {
      rejected.push({ field, reason: "evidence_not_in_job_description" });
      continue;
    }

    const typedField = field as PatchableJobField;
    const valueResult = valueSchemas[typedField].safeParse(parsed.data.value);
    if (!valueResult.success) {
      rejected.push({ field, reason: "invalid_value" });
      continue;
    }
    const value = valueResult.data;
    if (!evidenceSupportsValue(typedField, value, evidence)) {
      rejected.push({ field, reason: "evidence_does_not_support_value" });
      continue;
    }

    const previousValue = job[typedField];
    if (valuesEqual(previousValue, value)) continue;
    if (confidence === "medium" && !isMissing(previousValue)) {
      rejected.push({ field, reason: "medium_confidence_cannot_overwrite" });
      continue;
    }

    updates[typedField] = value;
    accepted.push({
      field: typedField,
      previousValue,
      newValue: value,
      confidence,
      evidence,
    });
  }

  const nextMin = (updates.salaryMinAmount ?? job.salaryMinAmount) as
    | number
    | null;
  const nextMax = (updates.salaryMaxAmount ?? job.salaryMaxAmount) as
    | number
    | null;
  if (nextMin !== null && nextMax !== null && nextMin > nextMax) {
    for (const field of ["salaryMinAmount", "salaryMaxAmount"] as const) {
      if (!(field in updates)) continue;
      delete updates[field];
      rejected.push({ field, reason: "invalid_salary_range" });
    }
    accepted = accepted.filter(
      ({ field }) => field !== "salaryMinAmount" && field !== "salaryMaxAmount",
    );
  }

  if (
    accepted.some(({ field }) =>
      [
        "salary",
        "salaryMinAmount",
        "salaryMaxAmount",
        "salaryCurrency",
        "salaryInterval",
      ].includes(field),
    )
  ) {
    updates.salarySource = "ai_job_fact_review";
  }
  if ("location" in updates) updates.locationEvidence = null;

  return {
    patchedJob: { ...job, ...updates },
    updates: updates as UpdateJobInput,
    accepted,
    rejected,
  };
}

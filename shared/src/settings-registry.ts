import { z } from "zod";
import type { ResumeProjectsSettings } from "./types/settings";

function parseNonEmptyStringOrNull(raw: string | undefined): string | null {
  return raw === undefined || raw === "" ? null : raw;
}

function parseIntOrNull(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseJsonArrayOrNull(raw: string | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function parseBitBoolOrNull(raw: string | undefined): boolean | null {
  if (!raw) return null;
  return raw === "true" || raw === "1";
}

function serializeNullableNumber(
  value: number | null | undefined,
): string | null {
  return value !== null && value !== undefined ? String(value) : null;
}

function serializeNullableJsonArray(
  value: string[] | null | undefined,
): string | null {
  return value !== null && value !== undefined ? JSON.stringify(value) : null;
}

function serializeBitBool(value: boolean | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value ? "1" : "0";
}

export const resumeProjectsSchema = z.object({
  maxProjects: z.number().int().min(0).max(100),
  lockedProjectIds: z.array(z.string().trim().min(1)).max(200),
  aiSelectableProjectIds: z.array(z.string().trim().min(1)).max(200),
});

export const settingsRegistry = {
  // --- Typed Settings ---
  model: {
    kind: "typed" as const,
    schema: z.string().trim().max(200),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.MODEL || "google/gemini-3-flash-preview"
        : "google/gemini-3-flash-preview",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  llmProvider: {
    kind: "typed" as const,
    envKey: "LLM_PROVIDER",
    schema: z.preprocess(
      (v) => (v === "" ? null : v),
      z
        .enum(["openrouter", "lmstudio", "ollama", "openai", "gemini"])
        .nullable(),
    ),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.LLM_PROVIDER || "openrouter"
        : "openrouter",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  llmBaseUrl: {
    kind: "typed" as const,
    envKey: "LLM_BASE_URL",
    schema: z.preprocess(
      (v) => (v === "" ? null : v),
      z.string().trim().url().max(2000).nullable(),
    ),
    default: (): string =>
      typeof process !== "undefined" ? process.env.LLM_BASE_URL || "" : "",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  pipelineWebhookUrl: {
    kind: "typed" as const,
    schema: z.string().trim().max(2000),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.PIPELINE_WEBHOOK_URL || process.env.WEBHOOK_URL || ""
        : "",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  jobCompleteWebhookUrl: {
    kind: "typed" as const,
    schema: z.string().trim().max(2000),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.JOB_COMPLETE_WEBHOOK_URL || ""
        : "",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  resumeProjects: {
    kind: "typed" as const,
    schema: resumeProjectsSchema,
    default: (): ResumeProjectsSettings => ({
      maxProjects: 20,
      lockedProjectIds: [],
      aiSelectableProjectIds: [],
    }),
    parse: (raw: string | undefined): ResumeProjectsSettings | null => {
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    serialize: (
      value: ResumeProjectsSettings | null | undefined,
    ): string | null => {
      return value ? JSON.stringify(value) : null;
    },
  },
  ukvisajobsMaxJobs: {
    kind: "typed" as const,
    schema: z.number().int().min(1).max(1000),
    default: (): number => 50,
    parse: parseIntOrNull,
    serialize: serializeNullableNumber,
  },
  adzunaMaxJobsPerTerm: {
    kind: "typed" as const,
    schema: z.number().int().min(1).max(1000),
    default: (): number =>
      parseInt(
        typeof process !== "undefined"
          ? process.env.ADZUNA_MAX_JOBS_PER_TERM || "50"
          : "50",
        10,
      ),
    parse: parseIntOrNull,
    serialize: serializeNullableNumber,
  },
  gradcrackerMaxJobsPerTerm: {
    kind: "typed" as const,
    schema: z.number().int().min(1).max(1000),
    default: (): number => 50,
    parse: parseIntOrNull,
    serialize: serializeNullableNumber,
  },
  searchTerms: {
    kind: "typed" as const,
    schema: z.array(z.string().trim().min(1).max(200)).max(100),
    default: (): string[] =>
      (typeof process !== "undefined"
        ? process.env.JOBSPY_SEARCH_TERMS || "web developer"
        : "web developer"
      )
        .split("|")
        .map((v) => v.trim())
        .filter(Boolean),
    parse: parseJsonArrayOrNull,
    serialize: serializeNullableJsonArray,
  },
  blockedCompanyKeywords: {
    kind: "typed" as const,
    schema: z.array(z.string().trim().min(1).max(200)).max(200),
    default: (): string[] => [],
    parse: parseJsonArrayOrNull,
    serialize: serializeNullableJsonArray,
  },
  searchCities: {
    kind: "typed" as const,
    schema: z.string().trim().max(100),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.SEARCH_CITIES || process.env.JOBSPY_LOCATION || "UK"
        : "UK",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  jobspyResultsWanted: {
    kind: "typed" as const,
    schema: z.number().int().min(1).max(1000),
    default: (): number =>
      parseInt(
        typeof process !== "undefined"
          ? process.env.JOBSPY_RESULTS_WANTED || "200"
          : "200",
        10,
      ),
    parse: parseIntOrNull,
    serialize: serializeNullableNumber,
  },
  jobspyCountryIndeed: {
    kind: "typed" as const,
    schema: z.string().trim().max(100),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.JOBSPY_COUNTRY_INDEED || "UK"
        : "UK",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  showSponsorInfo: {
    kind: "typed" as const,
    schema: z.boolean(),
    default: (): boolean => true,
    parse: parseBitBoolOrNull,
    serialize: serializeBitBool,
  },
  chatStyleTone: {
    kind: "typed" as const,
    schema: z.string().trim().max(100),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.CHAT_STYLE_TONE || "professional"
        : "professional",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  chatStyleFormality: {
    kind: "typed" as const,
    schema: z.string().trim().max(100),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.CHAT_STYLE_FORMALITY || "medium"
        : "medium",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  chatStyleConstraints: {
    kind: "typed" as const,
    schema: z.string().trim().max(4000),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.CHAT_STYLE_CONSTRAINTS || ""
        : "",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  chatStyleDoNotUse: {
    kind: "typed" as const,
    schema: z.string().trim().max(1000),
    default: (): string =>
      typeof process !== "undefined"
        ? process.env.CHAT_STYLE_DO_NOT_USE || ""
        : "",
    parse: parseNonEmptyStringOrNull,
    serialize: (value: string | null | undefined): string | null =>
      value ?? null,
  },
  backupEnabled: {
    kind: "typed" as const,
    schema: z.boolean(),
    default: (): boolean => false,
    parse: parseBitBoolOrNull,
    serialize: serializeBitBool,
  },
  backupHour: {
    kind: "typed" as const,
    schema: z.number().int().min(0).max(23),
    default: (): number => 2,
    parse: (raw: string | undefined): number | null => {
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (Number.isNaN(parsed)) return null;
      return Math.min(23, Math.max(0, parsed));
    },
    serialize: serializeNullableNumber,
  },
  backupMaxCount: {
    kind: "typed" as const,
    schema: z.number().int().min(1).max(5),
    default: (): number => 5,
    parse: (raw: string | undefined): number | null => {
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (Number.isNaN(parsed)) return null;
      return Math.min(5, Math.max(1, parsed));
    },
    serialize: serializeNullableNumber,
  },
  penalizeMissingSalary: {
    kind: "typed" as const,
    schema: z.boolean(),
    default: (): boolean => {
      if (typeof process === "undefined") return false;
      const v = process.env.PENALIZE_MISSING_SALARY || "0";
      return v === "1" || v.toLowerCase() === "true";
    },
    parse: parseBitBoolOrNull,
    serialize: serializeBitBool,
  },
  missingSalaryPenalty: {
    kind: "typed" as const,
    schema: z.number().int().min(0).max(100),
    default: (): number => {
      if (typeof process === "undefined") return 10;
      const raw = process.env.MISSING_SALARY_PENALTY;
      if (!raw) return 10;
      const parsed = parseInt(raw, 10);
      return Number.isNaN(parsed) ? 10 : Math.min(100, Math.max(0, parsed));
    },
    parse: (raw: string | undefined): number | null => {
      const parsed = raw ? parseInt(raw, 10) : NaN;
      return Number.isNaN(parsed) ? null : Math.min(100, Math.max(0, parsed));
    },
    serialize: serializeNullableNumber,
  },
  autoSkipScoreThreshold: {
    kind: "typed" as const,
    schema: z.number().int().min(0).max(100),
    default: (): number | null => null,
    parse: (raw: string | undefined): number | null => {
      if (!raw || raw === "null" || raw === "") return null;
      const parsed = parseInt(raw, 10);
      return Number.isNaN(parsed) ? null : Math.min(100, Math.max(0, parsed));
    },
    serialize: (value: number | null | undefined): string | null => {
      return value === null || value === undefined ? null : String(value);
    },
  },

  // --- Model Variants ---
  modelScorer: {
    kind: "model" as const,
    schema: z.string().trim().max(200),
  },
  modelTailoring: {
    kind: "model" as const,
    schema: z.string().trim().max(200),
  },
  modelProjectSelection: {
    kind: "model" as const,
    schema: z.string().trim().max(200),
  },

  // --- Simple Strings ---
  rxresumeBaseResumeId: {
    kind: "string" as const,
    schema: z.string().trim().max(200),
  },
  rxresumeEmail: {
    kind: "string" as const,
    envKey: "RXRESUME_EMAIL",
    schema: z.string().trim().max(200),
  },
  ukvisajobsEmail: {
    kind: "string" as const,
    envKey: "UKVISAJOBS_EMAIL",
    schema: z.string().trim().max(200),
  },
  adzunaAppId: {
    kind: "string" as const,
    envKey: "ADZUNA_APP_ID",
    schema: z.string().trim().max(200),
  },
  basicAuthUser: {
    kind: "string" as const,
    envKey: "BASIC_AUTH_USER",
    schema: z.string().trim().max(200),
  },

  // --- Secrets ---
  llmApiKey: {
    kind: "secret" as const,
    envKey: "LLM_API_KEY",
    schema: z.string().trim().max(2000),
  },
  rxresumePassword: {
    kind: "secret" as const,
    envKey: "RXRESUME_PASSWORD",
    schema: z.string().trim().max(2000),
  },
  ukvisajobsPassword: {
    kind: "secret" as const,
    envKey: "UKVISAJOBS_PASSWORD",
    schema: z.string().trim().max(2000),
  },
  adzunaAppKey: {
    kind: "secret" as const,
    envKey: "ADZUNA_APP_KEY",
    schema: z.string().trim().max(2000),
  },
  basicAuthPassword: {
    kind: "secret" as const,
    envKey: "BASIC_AUTH_PASSWORD",
    schema: z.string().trim().max(2000),
  },
  webhookSecret: {
    kind: "secret" as const,
    envKey: "WEBHOOK_SECRET",
    schema: z.string().trim().max(2000),
  },

  // --- Aliases ---
  jobspyLocation: {
    kind: "alias" as const,
    schema: z.string().trim().max(100),
    target: "searchCities" as const,
  },

  // --- Virtual ---
  enableBasicAuth: {
    kind: "virtual" as const,
    schema: z.boolean(),
  },
} as const;

export type SettingsRegistry = typeof settingsRegistry;
export type SettingsRegistryKey = keyof SettingsRegistry;

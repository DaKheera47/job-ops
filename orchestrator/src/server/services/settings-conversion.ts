type SettingMetadata<T, Input = T | null | undefined> = {
  defaultValue: () => T;
  parseOverride: (raw: string | undefined) => T | null;
  serialize: (value: Input) => string | null;
  resolve: (args: { defaultValue: T; overrideValue: T | null }) => T;
};

type SettingsConversionValueMap = {
  ukvisajobsMaxJobs: number;
  adzunaMaxJobsPerTerm: number;
  gradcrackerMaxJobsPerTerm: number;
  searchTerms: string[];
  searchCities: string;
  jobspyResultsWanted: number;
  jobspyCountryIndeed: string;
  showSponsorInfo: boolean;
  chatStyleTone: string;
  chatStyleFormality: string;
  chatStyleConstraints: string;
  chatStyleDoNotUse: string;
  backupEnabled: boolean;
  backupHour: number;
  backupMaxCount: number;
  penalizeMissingSalary: boolean;
  missingSalaryPenalty: number;
  autoSkipScoreThreshold: number | null;
};

type SettingsConversionInputMap = {
  [K in keyof SettingsConversionValueMap]:
    | SettingsConversionValueMap[K]
    | null
    | undefined;
};

type SettingsConversionMetadata = {
  [K in keyof SettingsConversionValueMap]: SettingMetadata<
    SettingsConversionValueMap[K],
    SettingsConversionInputMap[K]
  >;
};

export type SettingsConversionKey = keyof SettingsConversionValueMap;

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

function resolveWithNullishFallback<T>(args: {
  defaultValue: T;
  overrideValue: T | null;
}): T {
  return args.overrideValue ?? args.defaultValue;
}

function resolveWithEmptyStringFallback(args: {
  defaultValue: string;
  overrideValue: string | null;
}): string {
  return args.overrideValue || args.defaultValue;
}

export const settingsConversionMetadata: SettingsConversionMetadata = {
  ukvisajobsMaxJobs: {
    defaultValue: () => 50,
    parseOverride: parseIntOrNull,
    serialize: serializeNullableNumber,
    resolve: resolveWithNullishFallback,
  },
  adzunaMaxJobsPerTerm: {
    defaultValue: () =>
      parseInt(process.env.ADZUNA_MAX_JOBS_PER_TERM || "50", 10),
    parseOverride: parseIntOrNull,
    serialize: serializeNullableNumber,
    resolve: resolveWithNullishFallback,
  },
  gradcrackerMaxJobsPerTerm: {
    defaultValue: () => 50,
    parseOverride: parseIntOrNull,
    serialize: serializeNullableNumber,
    resolve: resolveWithNullishFallback,
  },
  searchTerms: {
    defaultValue: () =>
      (process.env.JOBSPY_SEARCH_TERMS || "web developer")
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean),
    parseOverride: parseJsonArrayOrNull,
    serialize: serializeNullableJsonArray,
    resolve: resolveWithNullishFallback,
  },
  searchCities: {
    defaultValue: () =>
      process.env.SEARCH_CITIES || process.env.JOBSPY_LOCATION || "UK",
    parseOverride: (raw) => raw ?? null,
    serialize: (value) => value ?? null,
    resolve: resolveWithEmptyStringFallback,
  },
  jobspyResultsWanted: {
    defaultValue: () =>
      parseInt(process.env.JOBSPY_RESULTS_WANTED || "200", 10),
    parseOverride: parseIntOrNull,
    serialize: serializeNullableNumber,
    resolve: resolveWithNullishFallback,
  },
  jobspyCountryIndeed: {
    defaultValue: () => process.env.JOBSPY_COUNTRY_INDEED || "UK",
    parseOverride: (raw) => raw ?? null,
    serialize: (value) => value ?? null,
    resolve: resolveWithEmptyStringFallback,
  },
  showSponsorInfo: {
    defaultValue: () => true,
    parseOverride: parseBitBoolOrNull,
    serialize: serializeBitBool,
    resolve: resolveWithNullishFallback,
  },
  chatStyleTone: {
    defaultValue: () => process.env.CHAT_STYLE_TONE || "professional",
    parseOverride: (raw) => raw ?? null,
    serialize: (value) => value ?? null,
    resolve: resolveWithEmptyStringFallback,
  },
  chatStyleFormality: {
    defaultValue: () => process.env.CHAT_STYLE_FORMALITY || "medium",
    parseOverride: (raw) => raw ?? null,
    serialize: (value) => value ?? null,
    resolve: resolveWithEmptyStringFallback,
  },
  chatStyleConstraints: {
    defaultValue: () => process.env.CHAT_STYLE_CONSTRAINTS || "",
    parseOverride: (raw) => raw ?? null,
    serialize: (value) => value ?? null,
    resolve: resolveWithEmptyStringFallback,
  },
  chatStyleDoNotUse: {
    defaultValue: () => process.env.CHAT_STYLE_DO_NOT_USE || "",
    parseOverride: (raw) => raw ?? null,
    serialize: (value) => value ?? null,
    resolve: resolveWithEmptyStringFallback,
  },
  backupEnabled: {
    defaultValue: () => false,
    parseOverride: parseBitBoolOrNull,
    serialize: serializeBitBool,
    resolve: resolveWithNullishFallback,
  },
  backupHour: {
    defaultValue: () => 2,
    parseOverride: (raw) => {
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (Number.isNaN(parsed)) return null;
      return Math.min(23, Math.max(0, parsed));
    },
    serialize: serializeNullableNumber,
    resolve: resolveWithNullishFallback,
  },
  backupMaxCount: {
    defaultValue: () => 5,
    parseOverride: (raw) => {
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (Number.isNaN(parsed)) return null;
      return Math.min(5, Math.max(1, parsed));
    },
    serialize: serializeNullableNumber,
    resolve: resolveWithNullishFallback,
  },
  penalizeMissingSalary: {
    defaultValue: () =>
      (process.env.PENALIZE_MISSING_SALARY || "0") === "1" ||
      (process.env.PENALIZE_MISSING_SALARY || "").toLowerCase() === "true",
    parseOverride: parseBitBoolOrNull,
    serialize: serializeBitBool,
    resolve: resolveWithNullishFallback,
  },
  missingSalaryPenalty: {
    defaultValue: () => {
      const raw = process.env.MISSING_SALARY_PENALTY;
      if (!raw) return 10;
      const parsed = parseInt(raw, 10);
      if (Number.isNaN(parsed)) return 10;
      return Math.min(100, Math.max(0, parsed));
    },
    parseOverride: (raw) => {
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (Number.isNaN(parsed)) return null;
      return Math.min(100, Math.max(0, parsed));
    },
    serialize: serializeNullableNumber,
    resolve: resolveWithNullishFallback,
  },
  autoSkipScoreThreshold: {
    defaultValue: () => null,
    parseOverride: (raw) => {
      if (!raw || raw === "null" || raw === "") return null;
      const parsed = parseInt(raw, 10);
      if (Number.isNaN(parsed)) return null;
      return Math.min(100, Math.max(0, parsed));
    },
    serialize: (value: number | null | undefined) => {
      if (value === null || value === undefined) return null;
      return String(value);
    },
    resolve: (args: {
      defaultValue: number | null;
      overrideValue: number | null;
    }) => {
      return args.overrideValue ?? args.defaultValue;
    },
  },
};

export function resolveSettingValue<K extends SettingsConversionKey>(
  key: K,
  raw: string | undefined,
): {
  defaultValue: SettingsConversionValueMap[K];
  overrideValue: SettingsConversionValueMap[K] | null;
  value: SettingsConversionValueMap[K];
} {
  const metadata = settingsConversionMetadata[key];
  const defaultValue = metadata.defaultValue();
  const overrideValue = metadata.parseOverride(raw);
  const value = metadata.resolve({
    defaultValue,
    overrideValue,
  });

  return { defaultValue, overrideValue, value };
}

export function serializeSettingValue<K extends SettingsConversionKey>(
  key: K,
  value: SettingsConversionInputMap[K],
): string | null {
  const metadata = settingsConversionMetadata[key];
  return metadata.serialize(value);
}

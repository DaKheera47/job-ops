type SettingMetadata<T, Input = T | null | undefined> = {
  defaultValue: () => T;
  parseOverride: (raw: string | undefined) => T | null;
  serialize: (value: Input) => string | null;
  resolve: (args: { defaultValue: T; overrideValue: T | null }) => T;
};

type SettingsConversionValueMap = {
  ukvisajobsMaxJobs: number;
  gradcrackerMaxJobsPerTerm: number;
  searchTerms: string[];
  jobspyLocation: string;
  jobspyResultsWanted: number;
  jobspyHoursOld: number;
  jobspyCountryIndeed: string;
  jobspySites: string[];
  jobspyLinkedinFetchDescription: boolean;
  jobspyIsRemote: boolean;
  showSponsorInfo: boolean;
  backupEnabled: boolean;
  backupHour: number;
  backupMaxCount: number;
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
  jobspyLocation: {
    defaultValue: () => process.env.JOBSPY_LOCATION || "UK",
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
  jobspyHoursOld: {
    defaultValue: () => parseInt(process.env.JOBSPY_HOURS_OLD || "72", 10),
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
  jobspySites: {
    defaultValue: () =>
      (process.env.JOBSPY_SITES || "indeed,linkedin")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    parseOverride: parseJsonArrayOrNull,
    serialize: serializeNullableJsonArray,
    resolve: resolveWithNullishFallback,
  },
  jobspyLinkedinFetchDescription: {
    defaultValue: () =>
      (process.env.JOBSPY_LINKEDIN_FETCH_DESCRIPTION || "1") === "1",
    parseOverride: parseBitBoolOrNull,
    serialize: serializeBitBool,
    resolve: resolveWithNullishFallback,
  },
  jobspyIsRemote: {
    defaultValue: () => (process.env.JOBSPY_IS_REMOTE || "0") === "1",
    parseOverride: parseBitBoolOrNull,
    serialize: serializeBitBool,
    resolve: resolveWithNullishFallback,
  },
  showSponsorInfo: {
    defaultValue: () => true,
    parseOverride: parseBitBoolOrNull,
    serialize: serializeBitBool,
    resolve: resolveWithNullishFallback,
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

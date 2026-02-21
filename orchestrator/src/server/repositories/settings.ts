/**
 * Settings repository - key/value storage for runtime configuration.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db/index";

const { settings } = schema;

export type SettingKey =
  | "model"
  | "modelScorer"
  | "modelTailoring"
  | "modelProjectSelection"
  | "llmProvider"
  | "llmBaseUrl"
  | "llmApiKey"
  | "pipelineWebhookUrl"
  | "jobCompleteWebhookUrl"
  | "resumeProjects"
  | "rxresumeBaseResumeId"
  | "ukvisajobsMaxJobs"
  | "adzunaMaxJobsPerTerm"
  | "gradcrackerMaxJobsPerTerm"
  | "searchTerms"
  | "searchCities"
  | "jobspyLocation"
  | "jobspyResultsWanted"
  | "jobspyCountryIndeed"
  | "showSponsorInfo"
  | "chatStyleTone"
  | "chatStyleFormality"
  | "chatStyleConstraints"
  | "chatStyleDoNotUse"
  | "rxresumeEmail"
  | "rxresumePassword"
  | "basicAuthUser"
  | "basicAuthPassword"
  | "ukvisajobsEmail"
  | "ukvisajobsPassword"
  | "adzunaAppId"
  | "adzunaAppKey"
  | "webhookSecret"
  | "backupEnabled"
  | "backupHour"
  | "backupMaxCount"
  | "penalizeMissingSalary"
  | "missingSalaryPenalty"
  | "autoSkipScoreThreshold";

export async function getSetting(key: SettingKey): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function getAllSettings(): Promise<
  Partial<Record<SettingKey, string>>
> {
  const rows = await db.select().from(settings);
  return rows.reduce(
    (acc, row) => {
      acc[row.key as SettingKey] = row.value;
      return acc;
    },
    {} as Partial<Record<SettingKey, string>>,
  );
}

export async function setSetting(
  key: SettingKey,
  value: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  if (value === null) {
    await db.delete(settings).where(eq(settings.key, key));
    return;
  }

  const [existing] = await db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, key));

  if (existing) {
    await db
      .update(settings)
      .set({ value, updatedAt: now })
      .where(eq(settings.key, key));
    return;
  }

  await db.insert(settings).values({
    key,
    value,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Settings repository - key/value storage for runtime configuration.
 */

import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'

const { settings } = schema

export type SettingKey = 'model'
  | 'modelScorer'
  | 'modelTailoring'
  | 'modelProjectSelection'
  | 'pipelineWebhookUrl'
  | 'jobCompleteWebhookUrl'
  | 'resumeProjects'
  | 'ukvisajobsMaxJobs'
  | 'gradcrackerMaxJobsPerTerm'
  | 'searchTerms'
  | 'jobspyLocation'
  | 'jobspyResultsWanted'
  | 'jobspyHoursOld'
  | 'jobspyCountryIndeed'
  | 'jobspySites'
  | 'jobspyLinkedinFetchDescription'
  | 'showSponsorInfo'

export async function getSetting(key: SettingKey): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key))
  return row?.value ?? null
}

export async function setSetting(key: SettingKey, value: string | null): Promise<void> {
  const now = new Date().toISOString()

  if (value === null) {
    await db.delete(settings).where(eq(settings.key, key))
    return
  }

  const [existing] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, key))

  if (existing) {
    await db
      .update(settings)
      .set({ value, updatedAt: now })
      .where(eq(settings.key, key))
    return
  }

  await db.insert(settings).values({
    key,
    value,
    createdAt: now,
    updatedAt: now,
  })
}

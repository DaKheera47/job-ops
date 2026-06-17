/**
 * Pipeline run repository.
 */

import { randomUUID } from "node:crypto";
import type {
  PipelineRun,
  PipelineRunConfigSnapshot,
  PipelineRunInsights,
  PipelineRunResultSummary,
  PipelineRunSavedDetails,
} from "@shared/types";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { jobs, pipelineRuns } = schema;

function mapRowToPipelineRun(
  row: typeof schema.pipelineRuns.$inferSelect,
): PipelineRun {
  return {
    id: row.id,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status as PipelineRun["status"],
    jobsDiscovered: row.jobsDiscovered,
    jobsProcessed: row.jobsProcessed,
    funnel: {
      searched: row.jobsSearched ?? 0,
      deduplicated: row.jobsDeduplicated ?? 0,
      livenessFiltered: row.jobsLivenessFiltered ?? 0,
      expired: row.jobsExpired ?? 0,
      scored: row.jobsScored ?? 0,
      autoSkipped: row.jobsAutoSkipped ?? 0,
      selected: row.jobsSelected ?? 0,
      ghostFlagged: row.jobsGhostFlagged ?? 0,
    },
    errorMessage: row.errorMessage,
    configSnapshot: parseConfigSnapshot(row.configSnapshot),
  };
}

function mapRowToSavedDetails(
  row: typeof schema.pipelineRuns.$inferSelect,
): PipelineRunSavedDetails | null {
  if (!row.requestedConfig || !row.effectiveConfig || !row.resultSummary) {
    return null;
  }

  return {
    requestedConfig:
      row.requestedConfig as PipelineRunSavedDetails["requestedConfig"],
    effectiveConfig:
      row.effectiveConfig as PipelineRunSavedDetails["effectiveConfig"],
    resultSummary:
      row.resultSummary as PipelineRunSavedDetails["resultSummary"],
  };
}

function serializeConfigSnapshot(
  value: PipelineRunConfigSnapshot | null | undefined,
): string | null {
  if (!value) return null;
  return JSON.stringify(value);
}

function parseConfigSnapshot(
  value: string | null | undefined,
): PipelineRunConfigSnapshot | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as PipelineRunConfigSnapshot;
  } catch {
    return null;
  }
}

/**
 * Create a new pipeline run.
 */
export async function createPipelineRun(args?: {
  configSnapshot?: PipelineRunConfigSnapshot | null;
  savedDetails?: PipelineRunSavedDetails | null;
}): Promise<PipelineRun> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const tenantId = getActiveTenantId();

  await db.insert(pipelineRuns).values({
    id,
    tenantId,
    startedAt: now,
    status: "running",
    configSnapshot: serializeConfigSnapshot(args?.configSnapshot ?? null),
    requestedConfig: args?.savedDetails?.requestedConfig ?? null,
    effectiveConfig: args?.savedDetails?.effectiveConfig ?? null,
    resultSummary: args?.savedDetails?.resultSummary ?? null,
  });

  return {
    id,
    startedAt: now,
    completedAt: null,
    status: "running",
    jobsDiscovered: 0,
    jobsProcessed: 0,
    funnel: {
      searched: 0,
      deduplicated: 0,
      livenessFiltered: 0,
      expired: 0,
      scored: 0,
      autoSkipped: 0,
      selected: 0,
      ghostFlagged: 0,
    },
    errorMessage: null,
    configSnapshot: args?.configSnapshot ?? null,
  };
}

/**
 * Update a pipeline run.
 */
export async function updatePipelineRun(
  id: string,
  update: Partial<{
    completedAt: string;
    status: "running" | "completed" | "failed" | "cancelled";
    jobsDiscovered: number;
    jobsProcessed: number;
    jobsSearched: number;
    jobsDeduplicated: number;
    jobsLivenessFiltered: number;
    jobsExpired: number;
    jobsScored: number;
    jobsAutoSkipped: number;
    jobsSelected: number;
    jobsGhostFlagged: number;
    errorMessage: string;
    configSnapshot: PipelineRunConfigSnapshot | null;
    resultSummary: PipelineRunResultSummary | null;
  }>,
): Promise<void> {
  const { configSnapshot, resultSummary, ...rest } = update;
  const tenantId = getActiveTenantId();
  await db
    .update(pipelineRuns)
    .set({
      ...rest,
      ...(Object.hasOwn(update, "configSnapshot")
        ? {
            configSnapshot: serializeConfigSnapshot(configSnapshot ?? null),
          }
        : {}),
      ...(Object.hasOwn(update, "resultSummary")
        ? { resultSummary: resultSummary ?? null }
        : {}),
    })
    .where(and(eq(pipelineRuns.tenantId, tenantId), eq(pipelineRuns.id, id)));
}

/**
 * Mark any pipeline_runs row still in `running` status as failed. Intended to
 * be called once on server startup: the in-memory pipeline state is empty
 * after a restart, so any row left in `running` is an orphan from a previous
 * process that was killed mid-run. Returns the number of rows updated.
 *
 * Operates across all tenants on purpose — this is a server-level maintenance
 * task, not a per-request action.
 */
export async function failOrphanedRunningPipelineRuns(): Promise<number> {
  const now = new Date().toISOString();
  const result = await db
    .update(pipelineRuns)
    .set({
      status: "failed",
      completedAt: now,
      errorMessage: "Pipeline interrupted by server restart",
    })
    .where(eq(pipelineRuns.status, "running"))
    .returning({ id: pipelineRuns.id });
  return result.length;
}

/**
 * Get the latest pipeline run.
 */
export async function getLatestPipelineRun(): Promise<PipelineRun | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.tenantId, tenantId))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1);

  if (!row) return null;

  return mapRowToPipelineRun(row);
}

/**
 * Get the latest pipeline run paired with its full saved details (snapshot
 * + resultSummary including filterMetrics).  Used by the Telegram bot's
 * end-of-run notification to render the funnel breakdown ("Discovered → …
 * → Selected").
 */
export async function getLatestPipelineRunWithDetails(): Promise<{
  run: PipelineRun;
  savedDetails: PipelineRunSavedDetails | null;
} | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.tenantId, tenantId))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1);

  if (!row) return null;

  return {
    run: mapRowToPipelineRun(row),
    savedDetails: mapRowToSavedDetails(row),
  };
}

/**
 * Get recent pipeline runs.
 */
export async function getRecentPipelineRuns(
  limit: number = 10,
): Promise<PipelineRun[]> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.tenantId, tenantId))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(limit);

  return rows.map(mapRowToPipelineRun);
}

export async function getPipelineRunById(
  id: string,
): Promise<PipelineRun | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.tenantId, tenantId), eq(pipelineRuns.id, id)))
    .limit(1);

  return row ? mapRowToPipelineRun(row) : null;
}

export async function getPipelineRunInsights(
  id: string,
): Promise<PipelineRunInsights | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.tenantId, tenantId), eq(pipelineRuns.id, id)))
    .limit(1);
  if (!row) return null;

  const run = mapRowToPipelineRun(row);
  const savedDetails = mapRowToSavedDetails(row);

  const durationMs =
    run.completedAt == null
      ? null
      : Math.max(
          0,
          new Date(run.completedAt).getTime() -
            new Date(run.startedAt).getTime(),
        );

  if (!run.completedAt) {
    return {
      run,
      exactMetrics: { durationMs },
      savedDetails,
      inferredMetrics: {
        jobsCreated: { value: null, quality: "unavailable" },
        jobsUpdated: { value: null, quality: "unavailable" },
        jobsProcessed: { value: null, quality: "unavailable" },
      },
    };
  }

  const countSelection = { count: sql<number>`count(*)` };
  const [[createdRow], [updatedRow], [processedRow]] = await Promise.all([
    db
      .select(countSelection)
      .from(jobs)
      .where(
        and(
          gte(jobs.createdAt, run.startedAt),
          lte(jobs.createdAt, run.completedAt),
          eq(jobs.tenantId, tenantId),
        ),
      ),
    db
      .select(countSelection)
      .from(jobs)
      .where(
        and(
          gte(jobs.updatedAt, run.startedAt),
          lte(jobs.updatedAt, run.completedAt),
          eq(jobs.tenantId, tenantId),
        ),
      ),
    db
      .select(countSelection)
      .from(jobs)
      .where(
        and(
          gte(jobs.processedAt, run.startedAt),
          lte(jobs.processedAt, run.completedAt),
          eq(jobs.tenantId, tenantId),
        ),
      ),
  ]);

  return {
    run,
    exactMetrics: { durationMs },
    savedDetails,
    inferredMetrics: {
      jobsCreated: {
        value: createdRow?.count ?? 0,
        quality: "inferred_from_timestamps",
      },
      jobsUpdated: {
        value: updatedRow?.count ?? 0,
        quality: "inferred_from_timestamps",
      },
      jobsProcessed: {
        value: processedRow?.count ?? 0,
        quality: "inferred_from_timestamps",
      },
    },
  };
}

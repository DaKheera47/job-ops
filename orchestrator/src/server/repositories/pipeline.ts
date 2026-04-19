/**
 * Pipeline run repository.
 */

import { randomUUID } from "node:crypto";
import type { PipelineRun, PipelineRunInsights } from "@shared/types";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "../db/index";

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
    errorMessage: row.errorMessage,
  };
}

/**
 * Create a new pipeline run.
 */
export async function createPipelineRun(): Promise<PipelineRun> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(pipelineRuns).values({
    id,
    startedAt: now,
    status: "running",
  });

  return {
    id,
    startedAt: now,
    completedAt: null,
    status: "running",
    jobsDiscovered: 0,
    jobsProcessed: 0,
    errorMessage: null,
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
    errorMessage: string;
  }>,
): Promise<void> {
  await db.update(pipelineRuns).set(update).where(eq(pipelineRuns.id, id));
}

/**
 * Get the latest pipeline run.
 */
export async function getLatestPipelineRun(): Promise<PipelineRun | null> {
  const [row] = await db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1);

  if (!row) return null;

  return mapRowToPipelineRun(row);
}

/**
 * Get recent pipeline runs.
 */
export async function getRecentPipelineRuns(
  limit: number = 10,
): Promise<PipelineRun[]> {
  const rows = await db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(limit);

  return rows.map(mapRowToPipelineRun);
}

export async function getPipelineRunById(
  id: string,
): Promise<PipelineRun | null> {
  const [row] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.id, id))
    .limit(1);

  return row ? mapRowToPipelineRun(row) : null;
}

export async function getPipelineRunInsights(
  id: string,
): Promise<PipelineRunInsights | null> {
  const run = await getPipelineRunById(id);
  if (!run) return null;

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
        ),
      ),
    db
      .select(countSelection)
      .from(jobs)
      .where(
        and(
          gte(jobs.updatedAt, run.startedAt),
          lte(jobs.updatedAt, run.completedAt),
        ),
      ),
    db
      .select(countSelection)
      .from(jobs)
      .where(
        and(
          gte(jobs.processedAt, run.startedAt),
          lte(jobs.processedAt, run.completedAt),
        ),
      ),
  ]);

  return {
    run,
    exactMetrics: { durationMs },
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

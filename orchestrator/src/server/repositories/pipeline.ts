/**
 * Pipeline run repository.
 */

import { randomUUID } from "node:crypto";
import type { PipelineRun } from "@shared/types";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/index";

const { pipelineRuns } = schema;

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

  return rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    status: row.status as PipelineRun["status"],
    jobsDiscovered: row.jobsDiscovered,
    jobsProcessed: row.jobsProcessed,
    errorMessage: row.errorMessage,
  }));
}

/**
 * Pipeline run repository.
 */

import { randomUUID } from "node:crypto";
import type { PipelineRun, PipelineRunConfigSnapshot } from "@shared/types";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/index";

const { pipelineRuns } = schema;

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
export async function createPipelineRun(
  configSnapshot?: PipelineRunConfigSnapshot | null,
): Promise<PipelineRun> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(pipelineRuns).values({
    id,
    startedAt: now,
    status: "running",
    configSnapshot: serializeConfigSnapshot(configSnapshot),
  });

  return {
    id,
    startedAt: now,
    completedAt: null,
    status: "running",
    jobsDiscovered: 0,
    jobsProcessed: 0,
    errorMessage: null,
    configSnapshot: configSnapshot ?? null,
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
    configSnapshot: PipelineRunConfigSnapshot | null;
  }>,
): Promise<void> {
  const { configSnapshot, ...rest } = update;
  await db
    .update(pipelineRuns)
    .set({
      ...rest,
      ...(Object.hasOwn(update, "configSnapshot")
        ? {
            configSnapshot: serializeConfigSnapshot(configSnapshot ?? null),
          }
        : {}),
    })
    .where(eq(pipelineRuns.id, id));
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
    configSnapshot: parseConfigSnapshot(row.configSnapshot),
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
    configSnapshot: parseConfigSnapshot(row.configSnapshot),
  }));
}

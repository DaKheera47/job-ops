import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_DEFAULT_JOBS,
  DEMO_DEFAULT_PIPELINE_RUNS,
  DEMO_DEFAULT_SETTINGS,
  DEMO_DEFAULT_STAGE_EVENTS,
} from "@server/config/demo-defaults";

const originalEnv = { ...process.env };

function sortedPairs(map: Record<string, string>) {
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

describe.sequential("demo seed baseline", () => {
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-demo-seed-test-"));
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
      MODEL: "test-model",
      DEMO_MODE: "true",
    };

    await import("../db/migrate");
    const dbMod = await import("../db/index");
    closeDb = dbMod.closeDb;
  });

  afterEach(async () => {
    if (closeDb) closeDb();
    await rm(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("buildDemoBaseline returns deterministic, schema-shaped fixtures", async () => {
    const { buildDemoBaseline } = await import("./demo-seed");

    const now = new Date("2026-02-05T12:00:00.000Z");
    const baseline = buildDemoBaseline(now);

    expect(baseline.resetAt).toBe(now.toISOString());
    expect(Object.keys(baseline.settings).length).toBeGreaterThan(0);
    expect(baseline.pipelineRuns).toHaveLength(DEMO_DEFAULT_PIPELINE_RUNS.length);
    expect(baseline.jobs).toHaveLength(DEMO_DEFAULT_JOBS.length);
    expect(baseline.stageEvents).toHaveLength(DEMO_DEFAULT_STAGE_EVENTS.length);

    const seededJobIds = baseline.jobs.map((job) => job.id).sort();
    expect(seededJobIds).toEqual(
      DEMO_DEFAULT_JOBS.map((job) => job.id).sort(),
    );
  });

  it("resetDemoData restores settings and data to demo defaults", async () => {
    const { db, schema } = await import("../db/index");
    const { resetDemoData } = await import("./demo-mode");
    const { setSetting, getAllSettings } = await import("../repositories/settings");

    await resetDemoData();

    await db.delete(schema.jobs);
    await db.insert(schema.jobs).values({
      id: "mutated-job",
      source: "manual",
      title: "Mutated Job",
      employer: "Mutated Employer",
      jobUrl: "https://demo.job-ops.local/jobs/mutated",
      status: "discovered",
    });
    await setSetting("llmProvider", "openai");

    await resetDemoData();

    const allJobs = await db.select({ id: schema.jobs.id }).from(schema.jobs);
    expect(allJobs.map((row) => row.id).sort()).toEqual(
      DEMO_DEFAULT_JOBS.map((job) => job.id).sort(),
    );

    const allSettings = (await getAllSettings()) as Record<string, string>;
    expect(sortedPairs(allSettings)).toEqual(
      sortedPairs(DEMO_DEFAULT_SETTINGS as Record<string, string>),
    );
  });

  it("reset is idempotent for logical baseline content", async () => {
    const { db, schema } = await import("../db/index");
    const { resetDemoData } = await import("./demo-mode");

    const logicalSnapshot = async () => {
      const [settingsRows, runRows, jobRows, stageRows] = await Promise.all([
        db.select({ key: schema.settings.key, value: schema.settings.value }).from(
          schema.settings,
        ),
        db
          .select({
            id: schema.pipelineRuns.id,
            status: schema.pipelineRuns.status,
            jobsDiscovered: schema.pipelineRuns.jobsDiscovered,
            jobsProcessed: schema.pipelineRuns.jobsProcessed,
            errorMessage: schema.pipelineRuns.errorMessage,
          })
          .from(schema.pipelineRuns),
        db
          .select({
            id: schema.jobs.id,
            status: schema.jobs.status,
            source: schema.jobs.source,
            title: schema.jobs.title,
            employer: schema.jobs.employer,
            notionPageId: schema.jobs.notionPageId,
          })
          .from(schema.jobs),
        db
          .select({
            id: schema.stageEvents.id,
            applicationId: schema.stageEvents.applicationId,
            fromStage: schema.stageEvents.fromStage,
            toStage: schema.stageEvents.toStage,
            title: schema.stageEvents.title,
          })
          .from(schema.stageEvents),
      ]);

      return {
        settings: settingsRows.sort((a, b) => a.key.localeCompare(b.key)),
        runs: runRows.sort((a, b) => a.id.localeCompare(b.id)),
        jobs: jobRows.sort((a, b) => a.id.localeCompare(b.id)),
        stageEvents: stageRows.sort((a, b) => a.id.localeCompare(b.id)),
      };
    };

    await resetDemoData();
    const first = await logicalSnapshot();
    await resetDemoData();
    const second = await logicalSnapshot();

    expect(second).toEqual(first);
  });
});

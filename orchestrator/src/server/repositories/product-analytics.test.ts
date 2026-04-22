import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("product analytics repository", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-analytics-repo-"));
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
    };
    await import("@server/db/migrate");
    ({ closeDb } = await import("@server/db"));
  });

  afterEach(async () => {
    closeDb?.();
    closeDb = null;
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates a stable install identity once and reuses it", async () => {
    const repo = await import("./product-analytics");

    const first = await repo.getOrCreateAnalyticsInstallState();
    const second = await repo.getOrCreateAnalyticsInstallState();

    expect(first.id).toBe("default");
    expect(first.distinctId).toBeTruthy();
    expect(second.distinctId).toBe(first.distinctId);
    expect(Date.parse(first.installedAt)).not.toBeNaN();
  });

  it("keeps milestone first-seen timestamps idempotent and prefers earlier backfill data", async () => {
    const repo = await import("./product-analytics");

    const initial = await repo.recordActivationMilestone({
      milestone: "activation_first_application",
      firstSeenAt: 2_000,
      sessionId: "session-a",
    });
    const duplicate = await repo.recordActivationMilestone({
      milestone: "activation_first_application",
      firstSeenAt: 4_000,
      sessionId: "session-b",
    });
    const backfilled = await repo.recordActivationMilestone({
      milestone: "activation_first_application",
      firstSeenAt: 1_000,
      sessionId: "session-earlier",
    });

    expect(initial.change).toBe("inserted");
    expect(duplicate.change).toBe("unchanged");
    expect(backfilled.change).toBe("updated");
    expect(backfilled.milestone.firstSeenAt).toBe(1_000);
    expect(backfilled.milestone.firstSessionId).toBe("session-earlier");
  });

  it("derives historical funnel candidates from existing data", async () => {
    const { db, schema } = await import("@server/db");
    const repo = await import("./product-analytics");

    await db.insert(schema.settings).values({
      key: "llmProvider",
      value: "openai",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await db.insert(schema.pipelineRuns).values({
      id: "run-1",
      startedAt: "2026-01-02T00:00:00.000Z",
      status: "running",
      jobsDiscovered: 0,
      jobsProcessed: 0,
    });
    await db.insert(schema.jobs).values({
      id: "job-1",
      source: "manual",
      title: "Role",
      employer: "Acme",
      jobUrl: "https://example.com/job-1",
      appliedAt: "2026-01-03T00:00:00.000Z",
      outcome: "offer_accepted",
      closedAt: 1_704_326_400,
      createdAt: "2026-01-01T06:00:00.000Z",
      discoveredAt: "2026-01-01T06:00:00.000Z",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
    await db.insert(schema.stageEvents).values([
      {
        id: "stage-1",
        applicationId: "job-1",
        title: "Recruiter Screen",
        fromStage: "applied",
        toStage: "recruiter_screen",
        occurredAt: 1_704_067_200,
      },
      {
        id: "stage-2",
        applicationId: "job-1",
        title: "Technical Interview",
        fromStage: "recruiter_screen",
        toStage: "technical_interview",
        occurredAt: 1_704_153_600,
      },
      {
        id: "stage-3",
        applicationId: "job-1",
        title: "Offer",
        fromStage: "technical_interview",
        toStage: "offer",
        occurredAt: 1_704_240_000,
        outcome: "offer_accepted",
      },
    ]);

    const installState = await repo.getOrCreateAnalyticsInstallState();
    const candidates = await repo.getHistoricalActivationMilestoneCandidates();

    expect(installState.installedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(candidates.activation_first_pipeline_run).toBe(
      Date.parse("2026-01-02T00:00:00.000Z"),
    );
    expect(candidates.activation_first_application).toBe(
      Date.parse("2026-01-03T00:00:00.000Z"),
    );
    expect(candidates.activation_first_positive_response).toBe(
      1_704_067_200_000,
    );
    expect(candidates.activation_first_interview).toBe(1_704_153_600_000);
    expect(candidates.activation_first_offer).toBe(1_704_240_000_000);
    expect(candidates.activation_first_acceptance).toBe(1_704_240_000_000);
  });
});

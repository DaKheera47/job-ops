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

  it("can sync milestones to corrected historical timestamps and delete stale ones", async () => {
    const repo = await import("./product-analytics");

    await repo.recordActivationMilestone({
      milestone: "activation_first_offer",
      firstSeenAt: 5_000,
      sessionId: "session-offer",
    });
    await repo.recordActivationMilestone({
      milestone: "activation_first_acceptance",
      firstSeenAt: 6_000,
      sessionId: "session-acceptance",
    });

    await repo.setActivationMilestoneFromHistory({
      milestone: "activation_first_offer",
      firstSeenAt: 7_000,
    });
    await repo.deleteActivationMilestone("activation_first_acceptance");

    const updatedOffer = await repo.getActivationMilestone(
      "activation_first_offer",
    );
    const deletedAcceptance = await repo.getActivationMilestone(
      "activation_first_acceptance",
    );

    expect(updatedOffer?.firstSeenAt).toBe(7_000);
    expect(updatedOffer?.firstSessionId).toBeNull();
    expect(deletedAcceptance).toBeNull();
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

  it("replays historical server events once and records replay state", async () => {
    const { db, schema } = await import("@server/db");
    const repo = await import("./product-analytics");

    const cutoffMs = Date.parse("2026-02-01T00:00:00.000Z");

    await db.insert(schema.jobs).values({
      id: "job-1",
      source: "manual",
      title: "Role",
      employer: "Acme",
      jobUrl: "https://example.com/job-1",
      discoveredAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await db.insert(schema.pipelineRuns).values({
      id: "run-1",
      startedAt: "2026-01-02T00:00:00.000Z",
      status: "completed",
      jobsDiscovered: 10,
      jobsProcessed: 8,
    });
    await db.insert(schema.stageEvents).values([
      {
        id: "stage-applied",
        applicationId: "job-1",
        title: "Applied",
        fromStage: null,
        toStage: "applied",
        occurredAt: 1_704_067_200,
        metadata: { eventLabel: "Applied", actor: "system" },
      },
      {
        id: "stage-screen",
        applicationId: "job-1",
        title: "Recruiter Screen",
        fromStage: "applied",
        toStage: "recruiter_screen",
        occurredAt: 1_704_153_600,
        metadata: { actor: "system" },
      },
      {
        id: "stage-interview",
        applicationId: "job-1",
        title: "Technical Interview",
        fromStage: "recruiter_screen",
        toStage: "technical_interview",
        occurredAt: 1_704_240_000,
        metadata: { actor: "user" },
      },
      {
        id: "stage-offer",
        applicationId: "job-1",
        title: "Offer",
        fromStage: "technical_interview",
        toStage: "offer",
        occurredAt: 1_704_326_400,
        metadata: { actor: "system" },
        outcome: "offer_accepted",
      },
    ]);
    await db.insert(schema.postApplicationMessages).values({
      id: "msg-1",
      provider: "gmail",
      accountKey: "default",
      externalMessageId: "external-1",
      fromAddress: "noreply@example.com",
      subject: "Matched",
      receivedAt: 1_704_067_200_000,
      snippet: "",
      relevanceDecision: "relevant",
      messageType: "other",
      processingStatus: "auto_linked",
      matchedJobId: "job-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await db.insert(schema.tracerLinks).values({
      id: "tracer-1",
      token: "token-1",
      jobId: "job-1",
      sourcePath: "/jobs/job-1",
      sourceLabel: "Role",
      destinationUrl: "https://example.com/redirect",
      destinationUrlHash: "hash-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await db.insert(schema.tracerClickEvents).values({
      id: "click-1",
      tracerLinkId: "tracer-1",
      clickedAt: 1_704_067_200,
      isLikelyBot: false,
      deviceType: "desktop",
      uaFamily: "chrome",
      osFamily: "mac",
      referrerHost: "mail.example.com",
    });

    const candidates = await repo.getHistoricalServerEventReplayCandidates({
      cutoffMs,
    });

    const candidateCounts = candidates.reduce(
      (counts, candidate) => {
        counts[candidate.eventName] = (counts[candidate.eventName] ?? 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );

    expect(candidateCounts).toEqual({
      jobs_pipeline_run_started: 1,
      application_marked_applied: 1,
      application_stage_reached: 3,
      application_positive_response_detected: 3,
      application_interview_stage_reached: 1,
      application_offer_detected: 1,
      application_accepted: 1,
      tracking_email_matched: 1,
      tracer_human_click_recorded: 1,
    });

    const stageCandidate = candidates.find(
      (candidate) =>
        candidate.eventKey === "application_stage_reached:stage-screen",
    );
    expect(stageCandidate?.occurredAt).toBe(1_704_153_600_000);

    const firstCandidate = candidates[0];
    expect(firstCandidate).toBeTruthy();

    if (!firstCandidate) {
      throw new Error("Expected replay candidates to be generated");
    }

    const claimed = await repo.claimAnalyticsServerEventReplay({
      eventKey: firstCandidate.eventKey,
      eventName: firstCandidate.eventName,
      occurredAt: firstCandidate.occurredAt,
      payload: firstCandidate.data,
    });
    expect(claimed).toBe(true);

    await repo.markAnalyticsServerEventReplayDelivered(firstCandidate.eventKey);
    await repo.markAnalyticsRawEventReplayCompleted({ version: 1 });

    const state = await repo.getAnalyticsRawEventReplayState();
    expect(state.rawEventReplayVersion).toBe(1);
    expect(state.rawEventReplayCompletedAt).toBeTruthy();
  });
});

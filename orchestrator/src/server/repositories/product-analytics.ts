import { randomUUID } from "node:crypto";
import { db, schema } from "@server/db";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

const {
  analyticsInstallState,
  analyticsMilestones,
  analyticsServerEventReplays,
  authSessions,
  designResumeDocuments,
  jobs,
  pipelineRuns,
  postApplicationIntegrations,
  postApplicationMessages,
  settings,
  stageEvents,
  tracerClickEvents,
  tracerLinks,
} = schema;

export const ANALYTICS_INSTALL_STATE_ID = "default";

export const ACTIVATION_MILESTONES = [
  "activation_first_pipeline_run",
  "activation_first_application",
  "activation_first_positive_response",
  "activation_first_interview",
  "activation_first_offer",
  "activation_first_acceptance",
] as const;

export type ActivationMilestone = (typeof ACTIVATION_MILESTONES)[number];

const POSITIVE_RESPONSE_STAGES = [
  "recruiter_screen",
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
] as const;

const INTERVIEW_STAGES = [
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
] as const;

type InstallState = typeof analyticsInstallState.$inferSelect;
type MilestoneRow = typeof analyticsMilestones.$inferSelect;

type Primitive = string | number | boolean | null;

export type HistoricalServerEventReplayCandidate = {
  eventKey: string;
  eventName: string;
  occurredAt: number;
  urlPath: string;
  data?: Record<string, Primitive>;
};

const RAW_EVENT_REPLAY_CLAIM_STALE_MS = 10 * 60 * 1000;
const HISTORICAL_REPLAY_EVENT_RANK: Record<string, number> = {
  jobs_pipeline_run_started: 0,
  application_marked_applied: 1,
  application_stage_reached: 2,
  application_positive_response_detected: 3,
  application_interview_stage_reached: 4,
  application_offer_detected: 5,
  application_accepted: 6,
  tracking_email_matched: 7,
  tracer_human_click_recorded: 8,
};

function toEpochMs(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, value) : null;
  }
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toIsoString(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function earlierTimestamp(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function classifyHistoricalStageAnalyticsSource(
  metadata: Record<string, unknown> | null,
  toStage: string,
): string {
  if (metadata?.reasonCode === "in_progress_board_drag") {
    return "in_progress_board";
  }
  if (metadata?.reasonCode === "job_page_manual_stage") {
    return "job_page";
  }
  if (metadata?.reasonCode === "post_application_auto_linked") {
    return "tracking_inbox_auto";
  }
  if (metadata?.reasonCode === "post_application_manual_linked") {
    return "tracking_inbox_review";
  }
  if (metadata?.actor === "system" && toStage === "applied") {
    return "mark_applied";
  }
  if (metadata?.actor === "user") {
    return "manual";
  }
  return "system";
}

function toPrimitiveRecord(
  value: Record<string, unknown> | null | undefined,
): Record<string, Primitive> | undefined {
  if (!value) return undefined;
  const result: Record<string, Primitive> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      result[key] = entry;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function buildReplayCandidate(args: {
  eventKey: string;
  eventName: string;
  occurredAt: number;
  urlPath: string;
  data?: Record<string, Primitive>;
}): HistoricalServerEventReplayCandidate {
  return args;
}

async function estimateInstallTimestampMs(): Promise<number> {
  const [
    earliestJobCreatedAt,
    earliestPipelineStartedAt,
    earliestSettingCreatedAt,
    earliestAuthSessionCreatedAt,
    earliestResumeCreatedAt,
    earliestIntegrationCreatedAt,
    earliestTracerLinkCreatedAt,
  ] = await Promise.all([
    db.select({ value: sql<string | null>`min(${jobs.createdAt})` }).from(jobs),
    db
      .select({ value: sql<string | null>`min(${pipelineRuns.startedAt})` })
      .from(pipelineRuns),
    db
      .select({ value: sql<string | null>`min(${settings.createdAt})` })
      .from(settings),
    db
      .select({ value: sql<string | null>`min(${authSessions.createdAt})` })
      .from(authSessions),
    db
      .select({
        value: sql<string | null>`min(${designResumeDocuments.createdAt})`,
      })
      .from(designResumeDocuments),
    db
      .select({
        value: sql<
          string | null
        >`min(${postApplicationIntegrations.createdAt})`,
      })
      .from(postApplicationIntegrations),
    db
      .select({ value: sql<string | null>`min(${tracerLinks.createdAt})` })
      .from(tracerLinks),
  ]);

  const installTimestampCandidates = [
    earliestJobCreatedAt[0]?.value ?? null,
    earliestPipelineStartedAt[0]?.value ?? null,
    earliestSettingCreatedAt[0]?.value ?? null,
    earliestAuthSessionCreatedAt[0]?.value ?? null,
    earliestResumeCreatedAt[0]?.value ?? null,
    earliestIntegrationCreatedAt[0]?.value ?? null,
    earliestTracerLinkCreatedAt[0]?.value ?? null,
  ];

  const earliest =
    installTimestampCandidates
      .map((value) => toEpochMs(value))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b)[0] ?? Date.now();

  return earliest;
}

function mapInstallState(row: InstallState): InstallState {
  return row;
}

export async function getAnalyticsInstallState(): Promise<InstallState | null> {
  const [row] = await db
    .select()
    .from(analyticsInstallState)
    .where(eq(analyticsInstallState.id, ANALYTICS_INSTALL_STATE_ID))
    .limit(1);
  return row ? mapInstallState(row) : null;
}

export async function getOrCreateAnalyticsInstallState(): Promise<InstallState> {
  const existing = await getAnalyticsInstallState();
  if (existing) return existing;

  const now = new Date().toISOString();
  const installedAt = toIsoString(await estimateInstallTimestampMs());

  try {
    await db.insert(analyticsInstallState).values({
      id: ANALYTICS_INSTALL_STATE_ID,
      distinctId: randomUUID(),
      installedAt,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    const concurrent = await getAnalyticsInstallState();
    if (concurrent) return concurrent;
    throw new Error("Failed to initialize analytics install state");
  }

  const created = await getAnalyticsInstallState();
  if (!created) {
    throw new Error("Failed to read analytics install state after creation");
  }
  return created;
}

export async function listActivationMilestones(): Promise<MilestoneRow[]> {
  return db
    .select()
    .from(analyticsMilestones)
    .where(inArray(analyticsMilestones.milestone, [...ACTIVATION_MILESTONES]));
}

export async function getActivationMilestone(
  milestone: ActivationMilestone,
): Promise<MilestoneRow | null> {
  const [row] = await db
    .select()
    .from(analyticsMilestones)
    .where(eq(analyticsMilestones.milestone, milestone))
    .limit(1);
  return row ?? null;
}

export async function recordActivationMilestone(args: {
  milestone: ActivationMilestone;
  firstSeenAt: number;
  sessionId?: string | null;
}): Promise<{
  milestone: MilestoneRow;
  change: "inserted" | "updated" | "unchanged";
}> {
  const existing = await getActivationMilestone(args.milestone);
  const now = new Date().toISOString();

  if (!existing) {
    await db.insert(analyticsMilestones).values({
      milestone: args.milestone,
      firstSeenAt: args.firstSeenAt,
      firstSessionId: args.sessionId ?? null,
      reportedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const inserted = await getActivationMilestone(args.milestone);
    if (!inserted) {
      throw new Error(`Failed to insert milestone '${args.milestone}'`);
    }
    return { milestone: inserted, change: "inserted" };
  }

  if (args.firstSeenAt < existing.firstSeenAt) {
    await db
      .update(analyticsMilestones)
      .set({
        firstSeenAt: args.firstSeenAt,
        ...(args.sessionId ? { firstSessionId: args.sessionId } : {}),
        updatedAt: now,
      })
      .where(eq(analyticsMilestones.milestone, args.milestone));
    const updated = await getActivationMilestone(args.milestone);
    if (!updated) {
      throw new Error(`Failed to update milestone '${args.milestone}'`);
    }
    return { milestone: updated, change: "updated" };
  }

  return { milestone: existing, change: "unchanged" };
}

export async function setActivationMilestoneFromHistory(args: {
  milestone: ActivationMilestone;
  firstSeenAt: number;
}): Promise<MilestoneRow> {
  const now = new Date().toISOString();

  await db
    .update(analyticsMilestones)
    .set({
      firstSeenAt: args.firstSeenAt,
      firstSessionId: null,
      updatedAt: now,
    })
    .where(eq(analyticsMilestones.milestone, args.milestone));

  const updated = await getActivationMilestone(args.milestone);
  if (!updated) {
    throw new Error(`Failed to sync milestone '${args.milestone}'`);
  }

  return updated;
}

export async function deleteActivationMilestone(
  milestone: ActivationMilestone,
): Promise<void> {
  await db
    .delete(analyticsMilestones)
    .where(eq(analyticsMilestones.milestone, milestone));
}

export async function markActivationMilestoneReported(
  milestone: ActivationMilestone,
): Promise<void> {
  await db
    .update(analyticsMilestones)
    .set({
      reportedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(analyticsMilestones.milestone, milestone));
}

export async function listPendingActivationMilestones(): Promise<
  MilestoneRow[]
> {
  return db
    .select()
    .from(analyticsMilestones)
    .where(
      and(
        inArray(analyticsMilestones.milestone, [...ACTIVATION_MILESTONES]),
        sql`${analyticsMilestones.reportedAt} IS NULL`,
      ),
    );
}

export async function getHistoricalActivationMilestoneCandidates(): Promise<
  Partial<Record<ActivationMilestone, number>>
> {
  const [
    earliestPipelineRun,
    earliestApplication,
    earliestPositiveResponse,
    earliestInterview,
    earliestOffer,
    earliestAcceptedJob,
    earliestAcceptedStage,
  ] = await Promise.all([
    db
      .select({ value: sql<string | null>`min(${pipelineRuns.startedAt})` })
      .from(pipelineRuns),
    db
      .select({ value: sql<string | null>`min(${jobs.appliedAt})` })
      .from(jobs)
      .where(isNotNull(jobs.appliedAt)),
    db
      .select({ value: sql<number | null>`min(${stageEvents.occurredAt})` })
      .from(stageEvents)
      .where(inArray(stageEvents.toStage, [...POSITIVE_RESPONSE_STAGES])),
    db
      .select({ value: sql<number | null>`min(${stageEvents.occurredAt})` })
      .from(stageEvents)
      .where(inArray(stageEvents.toStage, [...INTERVIEW_STAGES])),
    db
      .select({ value: sql<number | null>`min(${stageEvents.occurredAt})` })
      .from(stageEvents)
      .where(eq(stageEvents.toStage, "offer")),
    db
      .select({ value: sql<number | null>`min(${jobs.closedAt})` })
      .from(jobs)
      .where(and(eq(jobs.outcome, "offer_accepted"), isNotNull(jobs.closedAt))),
    db
      .select({ value: sql<number | null>`min(${stageEvents.occurredAt})` })
      .from(stageEvents)
      .where(eq(stageEvents.outcome, "offer_accepted")),
  ]);

  const earliestPipelineRunValue = earliestPipelineRun[0]?.value ?? null;
  const earliestApplicationValue = earliestApplication[0]?.value ?? null;
  const earliestPositiveResponseValue =
    earliestPositiveResponse[0]?.value ?? null;
  const earliestInterviewValue = earliestInterview[0]?.value ?? null;
  const earliestOfferValue = earliestOffer[0]?.value ?? null;
  const earliestAcceptedJobValue = earliestAcceptedJob[0]?.value ?? null;
  const earliestAcceptedStageValue = earliestAcceptedStage[0]?.value ?? null;

  const acceptanceTimestamp = earlierTimestamp(
    earliestAcceptedJobValue !== null ? earliestAcceptedJobValue * 1000 : null,
    earliestAcceptedStageValue !== null
      ? earliestAcceptedStageValue * 1000
      : null,
  );

  return {
    ...(toEpochMs(earliestPipelineRunValue) !== null
      ? {
          activation_first_pipeline_run: toEpochMs(
            earliestPipelineRunValue,
          ) as number,
        }
      : {}),
    ...(toEpochMs(earliestApplicationValue) !== null
      ? {
          activation_first_application: toEpochMs(
            earliestApplicationValue,
          ) as number,
        }
      : {}),
    ...(earliestPositiveResponseValue !== null
      ? {
          activation_first_positive_response:
            earliestPositiveResponseValue * 1000,
        }
      : {}),
    ...(earliestInterviewValue !== null
      ? { activation_first_interview: earliestInterviewValue * 1000 }
      : {}),
    ...(earliestOfferValue !== null
      ? { activation_first_offer: earliestOfferValue * 1000 }
      : {}),
    ...(acceptanceTimestamp !== null
      ? { activation_first_acceptance: acceptanceTimestamp }
      : {}),
  };
}

export async function getAnalyticsRawEventReplayState(): Promise<InstallState> {
  return getOrCreateAnalyticsInstallState();
}

export async function markAnalyticsRawEventReplayCompleted(args: {
  version: number;
  completedAt?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await getOrCreateAnalyticsInstallState();
  await db
    .update(analyticsInstallState)
    .set({
      rawEventReplayVersion: args.version,
      rawEventReplayCompletedAt: args.completedAt ?? now,
      updatedAt: now,
    })
    .where(eq(analyticsInstallState.id, ANALYTICS_INSTALL_STATE_ID));
}

export async function claimAnalyticsServerEventReplay(args: {
  eventKey: string;
  eventName: string;
  occurredAt: number;
  payload: Record<string, Primitive> | undefined;
}): Promise<boolean> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const staleBefore = nowMs - RAW_EVENT_REPLAY_CLAIM_STALE_MS;

  const updated = await db
    .update(analyticsServerEventReplays)
    .set({
      eventName: args.eventName,
      occurredAt: args.occurredAt,
      payload: args.payload ?? {},
      claimedAt: nowMs,
      updatedAt: nowIso,
    })
    .where(
      and(
        eq(analyticsServerEventReplays.eventKey, args.eventKey),
        sql`${analyticsServerEventReplays.reportedAt} IS NULL`,
        sql`(${analyticsServerEventReplays.claimedAt} IS NULL OR ${analyticsServerEventReplays.claimedAt} < ${staleBefore})`,
      ),
    )
    .run();
  if (updated.changes > 0) {
    return true;
  }

  try {
    await db.insert(analyticsServerEventReplays).values({
      eventKey: args.eventKey,
      eventName: args.eventName,
      occurredAt: args.occurredAt,
      payload: args.payload ?? {},
      claimedAt: nowMs,
      reportedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return true;
  } catch {
    const [existing] = await db
      .select()
      .from(analyticsServerEventReplays)
      .where(eq(analyticsServerEventReplays.eventKey, args.eventKey))
      .limit(1);

    if (!existing || existing.reportedAt !== null) {
      return false;
    }

    const canReclaim =
      existing.claimedAt === null || existing.claimedAt < staleBefore;
    if (!canReclaim) {
      return false;
    }

    const reclaimed = await db
      .update(analyticsServerEventReplays)
      .set({
        eventName: args.eventName,
        occurredAt: args.occurredAt,
        payload: args.payload ?? {},
        claimedAt: nowMs,
        updatedAt: nowIso,
      })
      .where(
        and(
          eq(analyticsServerEventReplays.eventKey, args.eventKey),
          sql`${analyticsServerEventReplays.reportedAt} IS NULL`,
          sql`(${analyticsServerEventReplays.claimedAt} IS NULL OR ${analyticsServerEventReplays.claimedAt} < ${staleBefore})`,
        ),
      )
      .run();
    return reclaimed.changes > 0;
  }
}

export async function markAnalyticsServerEventReplayDelivered(
  eventKey: string,
): Promise<void> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  await db
    .update(analyticsServerEventReplays)
    .set({
      reportedAt: nowMs,
      updatedAt: nowIso,
    })
    .where(eq(analyticsServerEventReplays.eventKey, eventKey));
}

export async function hasPendingAnalyticsServerEventReplays(
  eventKeys: string[],
): Promise<boolean> {
  if (eventKeys.length === 0) return false;

  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(analyticsServerEventReplays)
    .where(
      and(
        inArray(analyticsServerEventReplays.eventKey, [...eventKeys]),
        sql`${analyticsServerEventReplays.reportedAt} IS NULL`,
      ),
    )
    .limit(1);

  return Number(row?.count ?? 0) > 0;
}

export async function getHistoricalServerEventReplayCandidates(args: {
  cutoffMs: number;
}): Promise<HistoricalServerEventReplayCandidate[]> {
  const cutoffSeconds = Math.floor(args.cutoffMs / 1000);

  const [pipelineRunRows, stageEventRows, messageRows, tracerClickRows] =
    await Promise.all([
      db
        .select({
          id: pipelineRuns.id,
          startedAt: pipelineRuns.startedAt,
        })
        .from(pipelineRuns),
      db
        .select({
          id: stageEvents.id,
          applicationId: stageEvents.applicationId,
          toStage: stageEvents.toStage,
          occurredAt: stageEvents.occurredAt,
          metadata: stageEvents.metadata,
          outcome: stageEvents.outcome,
        })
        .from(stageEvents)
        .where(sql`${stageEvents.occurredAt} < ${cutoffSeconds}`),
      db
        .select({
          id: postApplicationMessages.id,
          provider: postApplicationMessages.provider,
          processingStatus: postApplicationMessages.processingStatus,
          receivedAt: postApplicationMessages.receivedAt,
          decidedAt: postApplicationMessages.decidedAt,
        })
        .from(postApplicationMessages)
        .where(
          and(
            inArray(postApplicationMessages.processingStatus, [
              "auto_linked",
              "manual_linked",
            ]),
            sql`coalesce(${postApplicationMessages.decidedAt}, ${postApplicationMessages.receivedAt}) < ${args.cutoffMs}`,
          ),
        ),
      db
        .select({
          id: tracerClickEvents.id,
          clickedAt: tracerClickEvents.clickedAt,
          isLikelyBot: tracerClickEvents.isLikelyBot,
          deviceType: tracerClickEvents.deviceType,
          uaFamily: tracerClickEvents.uaFamily,
          referrerHost: tracerClickEvents.referrerHost,
        })
        .from(tracerClickEvents)
        .where(sql`${tracerClickEvents.clickedAt} < ${cutoffSeconds}`),
    ]);

  const candidates: HistoricalServerEventReplayCandidate[] = [];
  const acceptedByJob = new Map<
    string,
    { occurredAt: number; source: string }
  >();

  for (const row of pipelineRunRows) {
    const occurredAt = toEpochMs(row.startedAt);
    if (occurredAt === null || occurredAt >= args.cutoffMs) continue;
    candidates.push(
      buildReplayCandidate({
        eventKey: `jobs_pipeline_run_started:${row.id}`,
        eventName: "jobs_pipeline_run_started",
        occurredAt,
        urlPath: "/jobs",
      }),
    );
  }

  for (const row of stageEventRows) {
    const metadata = parseJsonRecord(row.metadata);
    if (metadata?.eventType === "note") {
      continue;
    }
    const source = classifyHistoricalStageAnalyticsSource(
      metadata,
      String(row.toStage),
    );

    if (String(row.toStage) !== "applied") {
      candidates.push(
        buildReplayCandidate({
          eventKey: `application_stage_reached:${row.id}`,
          eventName: "application_stage_reached",
          occurredAt: row.occurredAt * 1000,
          urlPath: "/applications/in-progress",
          data: toPrimitiveRecord({
            stage: String(row.toStage),
            source,
            actor: typeof metadata?.actor === "string" ? metadata.actor : null,
          }),
        }),
      );
    }

    if (POSITIVE_RESPONSE_STAGES.includes(row.toStage as never)) {
      candidates.push(
        buildReplayCandidate({
          eventKey: `application_positive_response_detected:${row.id}`,
          eventName: "application_positive_response_detected",
          occurredAt: row.occurredAt * 1000,
          urlPath: "/applications/in-progress",
          data: toPrimitiveRecord({
            stage: String(row.toStage),
            source,
          }),
        }),
      );
    }

    if (INTERVIEW_STAGES.includes(row.toStage as never)) {
      candidates.push(
        buildReplayCandidate({
          eventKey: `application_interview_stage_reached:${row.id}`,
          eventName: "application_interview_stage_reached",
          occurredAt: row.occurredAt * 1000,
          urlPath: "/applications/in-progress",
          data: toPrimitiveRecord({
            stage: String(row.toStage),
            source,
          }),
        }),
      );
    }

    if (row.toStage === "offer") {
      candidates.push(
        buildReplayCandidate({
          eventKey: `application_offer_detected:${row.id}`,
          eventName: "application_offer_detected",
          occurredAt: row.occurredAt * 1000,
          urlPath: "/applications/in-progress",
          data: toPrimitiveRecord({
            source,
          }),
        }),
      );
    }

    if (row.toStage === "offer" || row.outcome === "offer_accepted") {
      const existing = acceptedByJob.get(row.applicationId);
      if (!existing || row.occurredAt * 1000 < existing.occurredAt) {
        acceptedByJob.set(row.applicationId, {
          occurredAt: row.occurredAt * 1000,
          source,
        });
      }
    }

    if (String(row.toStage) === "applied") {
      candidates.push(
        buildReplayCandidate({
          eventKey: `application_marked_applied:${row.id}`,
          eventName: "application_marked_applied",
          occurredAt: row.occurredAt * 1000,
          urlPath: "/applications/in-progress",
          data: toPrimitiveRecord({
            source,
          }),
        }),
      );
    }
  }

  for (const [applicationId, accepted] of acceptedByJob.entries()) {
    candidates.push(
      buildReplayCandidate({
        eventKey: `application_accepted:${applicationId}`,
        eventName: "application_accepted",
        occurredAt: accepted.occurredAt,
        urlPath: "/applications/in-progress",
        data: toPrimitiveRecord({
          source: accepted.source,
        }),
      }),
    );
  }

  for (const row of messageRows) {
    const occurredAt =
      typeof row.decidedAt === "number" && Number.isFinite(row.decidedAt)
        ? row.decidedAt
        : row.receivedAt;
    candidates.push(
      buildReplayCandidate({
        eventKey: `tracking_email_matched:${row.id}`,
        eventName: "tracking_email_matched",
        occurredAt,
        urlPath: "/tracking-inbox",
        data: toPrimitiveRecord({
          provider: String(row.provider),
          match_mode:
            row.processingStatus === "auto_linked"
              ? "auto_link"
              : "manual_review",
          result: "success",
        }),
      }),
    );
  }

  for (const row of tracerClickRows) {
    if (row.isLikelyBot) continue;
    candidates.push(
      buildReplayCandidate({
        eventKey: `tracer_human_click_recorded:${row.id}`,
        eventName: "tracer_human_click_recorded",
        occurredAt: row.clickedAt * 1000,
        urlPath: "/tracer-links",
        data: toPrimitiveRecord({
          device_type: row.deviceType,
          ua_family: row.uaFamily,
          has_referrer: Boolean(row.referrerHost),
        }),
      }),
    );
  }

  return candidates.sort((left, right) => {
    if (left.occurredAt !== right.occurredAt) {
      return left.occurredAt - right.occurredAt;
    }
    const leftRank = HISTORICAL_REPLAY_EVENT_RANK[left.eventName] ?? 99;
    const rightRank = HISTORICAL_REPLAY_EVENT_RANK[right.eventName] ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.eventKey.localeCompare(right.eventKey);
  });
}

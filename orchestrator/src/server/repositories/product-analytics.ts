import { randomUUID } from "node:crypto";
import { db, schema } from "@server/db";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

const {
  analyticsInstallState,
  analyticsMilestones,
  authSessions,
  designResumeDocuments,
  jobs,
  pipelineRuns,
  postApplicationIntegrations,
  settings,
  stageEvents,
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

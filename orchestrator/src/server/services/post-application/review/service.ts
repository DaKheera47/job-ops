import { randomUUID } from "node:crypto";
import { conflict, notFound, unprocessableEntity } from "@infra/errors";
import { db, schema } from "@server/db";
import { getJobById, listJobSummariesByIds } from "@server/repositories/jobs";
import {
  getPostApplicationMessageById,
  listPostApplicationMessagesByProcessingStatus,
  listPostApplicationMessagesBySyncRun,
  updatePostApplicationMessageDecision,
} from "@server/repositories/post-application-messages";
import {
  getPostApplicationSyncRunById,
  listPostApplicationSyncRuns,
} from "@server/repositories/post-application-sync-runs";
import type {
  ApplicationStage,
  PostApplicationInboxItem,
  PostApplicationMessage,
  PostApplicationProvider,
  PostApplicationSyncRun,
} from "@shared/types";
import { desc, eq, sql } from "drizzle-orm";

const { jobs, postApplicationSyncRuns, stageEvents } = schema;

const STAGE_TO_JOB_STATUS: Record<ApplicationStage, "applied"> = {
  applied: "applied",
  recruiter_screen: "applied",
  assessment: "applied",
  hiring_manager_screen: "applied",
  technical_interview: "applied",
  onsite: "applied",
  offer: "applied",
  closed: "applied",
};

function inferStageFromMessageType(
  message: PostApplicationMessage,
): ApplicationStage | null {
  if (message.messageType === "interview") return "technical_interview";
  if (message.messageType === "offer") return "offer";
  if (message.messageType === "rejection") return "closed";
  if (message.messageType === "update") return "recruiter_screen";
  return null;
}

function buildMatchedJobMap(
  items: PostApplicationMessage[],
  jobs: Awaited<ReturnType<typeof listJobSummariesByIds>>,
): PostApplicationInboxItem[] {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  return items.map((message) => ({
    message,
    matchedJob: message.matchedJobId
      ? (jobById.get(message.matchedJobId) ?? null)
      : null,
  }));
}

export async function listPostApplicationInbox(args: {
  provider: PostApplicationProvider;
  accountKey: string;
  limit?: number;
}): Promise<PostApplicationInboxItem[]> {
  const limit = args.limit ?? 50;
  const messages = await listPostApplicationMessagesByProcessingStatus(
    args.provider,
    args.accountKey,
    "pending_user",
    limit,
  );

  const jobIds = Array.from(
    new Set(messages.map((message) => message.matchedJobId).filter(Boolean)),
  ) as string[];
  const jobs = await listJobSummariesByIds(jobIds);
  return buildMatchedJobMap(messages, jobs);
}

export async function approvePostApplicationInboxItem(args: {
  messageId: string;
  provider: PostApplicationProvider;
  accountKey: string;
  jobId?: string;
  toStage?: ApplicationStage;
  note?: string;
  decidedBy?: string | null;
}): Promise<{ message: PostApplicationMessage; stageEventId: string | null }> {
  const message = await getPostApplicationMessageById(args.messageId);
  if (!message) {
    throw notFound(`Post-application message '${args.messageId}' not found.`);
  }
  if (
    message.provider !== args.provider ||
    message.accountKey !== args.accountKey
  ) {
    throw notFound(`Post-application message '${args.messageId}' not found.`);
  }
  if (message.processingStatus !== "pending_user") {
    throw conflict(
      `Message '${args.messageId}' is already decided with status '${message.processingStatus}'.`,
    );
  }

  const resolvedJobId = args.jobId ?? message.matchedJobId;
  if (!resolvedJobId) {
    throw unprocessableEntity(
      "Approval requires a resolved jobId from payload or message suggestion.",
    );
  }

  const targetJob = await getJobById(resolvedJobId);
  if (!targetJob) {
    throw notFound(`Job '${resolvedJobId}' not found.`);
  }

  const decidedAt = Date.now();
  const updated = db.transaction(() => {
    let stageEventId: string | null = null;

    if (message.messageType !== "other") {
      const latestEvent = db
        .select()
        .from(stageEvents)
        .where(eq(stageEvents.applicationId, resolvedJobId))
        .orderBy(desc(stageEvents.occurredAt))
        .limit(1)
        .get();

      const fromStage =
        (latestEvent?.toStage as ApplicationStage | undefined) ?? null;
      const finalToStage =
        args.toStage ??
        inferStageFromMessageType(message) ??
        fromStage ??
        "applied";

      const occurredAtSeconds = Math.floor(
        Number.isFinite(message.receivedAt)
          ? message.receivedAt / 1000
          : decidedAt / 1000,
      );
      stageEventId = randomUUID();

      db.insert(stageEvents)
        .values({
          id: stageEventId,
          applicationId: resolvedJobId,
          title: `Post-application: ${message.messageType}`,
          groupId: "post_application_router",
          fromStage,
          toStage: finalToStage,
          occurredAt: occurredAtSeconds,
          metadata: {
            actor: "system",
            eventType: "status_update",
            eventLabel: `Post-application: ${message.messageType}`,
            note: args.note ?? null,
            reasonCode: "post_application_manual_linked",
          },
          outcome: null,
        })
        .run();

      const shouldSetAppliedAt = !targetJob.appliedAt;
      db.update(jobs)
        .set({
          status: STAGE_TO_JOB_STATUS[finalToStage],
          ...(shouldSetAppliedAt
            ? { appliedAt: new Date(decidedAt).toISOString() }
            : {}),
          updatedAt: new Date(decidedAt).toISOString(),
        })
        .where(eq(jobs.id, resolvedJobId))
        .run();
    }

    db.update(postApplicationSyncRuns)
      .set({
        messagesApproved: sql`${postApplicationSyncRuns.messagesApproved} + 1`,
        updatedAt: new Date(decidedAt).toISOString(),
      })
      .where(eq(postApplicationSyncRuns.id, message.syncRunId ?? ""))
      .run();

    return { stageEventId };
  });

  const updatedMessage = await updatePostApplicationMessageDecision({
    id: message.id,
    processingStatus: "manual_linked",
    matchedJobId: resolvedJobId,
    decidedAt,
    decidedBy: args.decidedBy ?? null,
  });

  if (!updatedMessage) {
    throw notFound(
      `Post-application message '${message.id}' not found after approval.`,
    );
  }

  return { message: updatedMessage, stageEventId: updated.stageEventId };
}

export async function denyPostApplicationInboxItem(args: {
  messageId: string;
  provider: PostApplicationProvider;
  accountKey: string;
  decidedBy?: string | null;
}): Promise<{ message: PostApplicationMessage }> {
  const message = await getPostApplicationMessageById(args.messageId);
  if (!message) {
    throw notFound(`Post-application message '${args.messageId}' not found.`);
  }
  if (
    message.provider !== args.provider ||
    message.accountKey !== args.accountKey
  ) {
    throw notFound(`Post-application message '${args.messageId}' not found.`);
  }
  if (message.processingStatus !== "pending_user") {
    throw conflict(
      `Message '${args.messageId}' is already decided with status '${message.processingStatus}'.`,
    );
  }

  const decidedAt = Date.now();
  if (message.syncRunId) {
    db.update(postApplicationSyncRuns)
      .set({
        messagesDenied: sql`${postApplicationSyncRuns.messagesDenied} + 1`,
        updatedAt: new Date(decidedAt).toISOString(),
      })
      .where(eq(postApplicationSyncRuns.id, message.syncRunId))
      .run();
  }

  const updatedMessage = await updatePostApplicationMessageDecision({
    id: message.id,
    processingStatus: "ignored",
    matchedJobId: null,
    decidedAt,
    decidedBy: args.decidedBy ?? null,
  });
  if (!updatedMessage) {
    throw notFound(
      `Post-application message '${message.id}' not found after denial.`,
    );
  }

  return { message: updatedMessage };
}

export async function listPostApplicationReviewRuns(args: {
  provider: PostApplicationProvider;
  accountKey: string;
  limit?: number;
}): Promise<PostApplicationSyncRun[]> {
  return listPostApplicationSyncRuns(
    args.provider,
    args.accountKey,
    args.limit ?? 20,
  );
}

export async function listPostApplicationRunMessages(args: {
  provider: PostApplicationProvider;
  accountKey: string;
  runId: string;
  limit?: number;
}): Promise<{
  run: PostApplicationSyncRun;
  items: PostApplicationInboxItem[];
}> {
  const run = await getPostApplicationSyncRunById(args.runId);
  if (
    !run ||
    run.provider !== args.provider ||
    run.accountKey !== args.accountKey
  ) {
    throw notFound(`Post-application sync run '${args.runId}' not found.`);
  }

  const messages = await listPostApplicationMessagesBySyncRun(
    args.provider,
    args.accountKey,
    args.runId,
    args.limit ?? 300,
  );

  const jobIds = Array.from(
    new Set(messages.map((message) => message.matchedJobId).filter(Boolean)),
  ) as string[];
  const jobs = await listJobSummariesByIds(jobIds);

  return { run, items: buildMatchedJobMap(messages, jobs) };
}

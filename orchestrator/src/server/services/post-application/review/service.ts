import {
  AppError,
  conflict,
  notFound,
  unprocessableEntity,
} from "@infra/errors";
import { db, schema } from "@server/db";
import { getJobById, listJobSummariesByIds } from "@server/repositories/jobs";
import {
  getPostApplicationMessageById,
  listPostApplicationMessagesByProcessingStatus,
  listPostApplicationMessagesBySyncRun,
} from "@server/repositories/post-application-messages";
import {
  getPostApplicationSyncRunById,
  listPostApplicationSyncRuns,
} from "@server/repositories/post-application-sync-runs";
import { transitionStage } from "@server/services/applicationTracking";
import {
  resolveStageTransitionForTarget,
  stageTargetFromMessageType,
} from "@server/services/post-application/stage-target";
import type {
  ApplicationStage,
  BulkPostApplicationActionRequest,
  BulkPostApplicationActionResponse,
  BulkPostApplicationActionResult,
  PostApplicationInboxItem,
  PostApplicationMessage,
  PostApplicationProvider,
  PostApplicationRouterStageTarget,
  PostApplicationSyncRun,
} from "@shared/types";
import { and, eq, sql } from "drizzle-orm";

const { postApplicationMessages, postApplicationSyncRuns } = schema;

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
  stageTarget?: PostApplicationRouterStageTarget;
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
  const updated = db.transaction((tx) => {
    let stageEventId: string | null = null;
    const decidedAtIso = new Date(decidedAt).toISOString();

    const messageUpdateResult = tx
      .update(postApplicationMessages)
      .set({
        processingStatus: "manual_linked",
        matchedJobId: resolvedJobId,
        decidedAt,
        decidedBy: args.decidedBy ?? null,
        updatedAt: decidedAtIso,
      })
      .where(
        and(
          eq(postApplicationMessages.id, message.id),
          eq(postApplicationMessages.processingStatus, "pending_user"),
        ),
      )
      .run();
    if (messageUpdateResult.changes === 0) {
      throw conflict(
        `Message '${message.id}' was already decided by another request.`,
      );
    }

    const resolvedTarget =
      args.stageTarget ??
      (args.toStage as PostApplicationRouterStageTarget | undefined) ??
      message.stageTarget ??
      stageTargetFromMessageType(message.messageType);
    const transition = resolveStageTransitionForTarget(resolvedTarget);

    if (transition.toStage !== "no_change") {
      const event = transitionStage(
        resolvedJobId,
        transition.toStage,
        Math.floor(
          Number.isFinite(message.receivedAt)
            ? message.receivedAt / 1000
            : decidedAt / 1000,
        ),
        {
          actor: "system",
          eventType: "status_update",
          eventLabel: `Post-application: ${resolvedTarget}`,
          note: args.note ?? null,
          reasonCode: transition.reasonCode ?? "post_application_manual_linked",
        },
        transition.outcome,
      );
      stageEventId = event.id;
    }

    if (message.syncRunId) {
      tx.update(postApplicationSyncRuns)
        .set({
          messagesApproved: sql`${postApplicationSyncRuns.messagesApproved} + 1`,
          updatedAt: decidedAtIso,
        })
        .where(eq(postApplicationSyncRuns.id, message.syncRunId))
        .run();
    }

    return { stageEventId };
  });

  const updatedMessage = await getPostApplicationMessageById(message.id);

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
  db.transaction((tx) => {
    const decidedAtIso = new Date(decidedAt).toISOString();
    const messageUpdateResult = tx
      .update(postApplicationMessages)
      .set({
        processingStatus: "ignored",
        matchedJobId: null,
        decidedAt,
        decidedBy: args.decidedBy ?? null,
        updatedAt: decidedAtIso,
      })
      .where(
        and(
          eq(postApplicationMessages.id, message.id),
          eq(postApplicationMessages.processingStatus, "pending_user"),
        ),
      )
      .run();
    if (messageUpdateResult.changes === 0) {
      throw conflict(
        `Message '${message.id}' was already decided by another request.`,
      );
    }

    if (message.syncRunId) {
      tx.update(postApplicationSyncRuns)
        .set({
          messagesDenied: sql`${postApplicationSyncRuns.messagesDenied} + 1`,
          updatedAt: decidedAtIso,
        })
        .where(eq(postApplicationSyncRuns.id, message.syncRunId))
        .run();
    }
  });

  const updatedMessage = await getPostApplicationMessageById(message.id);
  if (!updatedMessage) {
    throw notFound(
      `Post-application message '${message.id}' not found after denial.`,
    );
  }

  return { message: updatedMessage };
}

export async function bulkPostApplicationInboxAction(
  args: BulkPostApplicationActionRequest & { decidedBy?: string | null },
): Promise<BulkPostApplicationActionResponse> {
  const { provider, accountKey, action, decidedBy } = args;

  const pendingItems = await listPostApplicationInbox({
    provider,
    accountKey,
    limit: 1000,
  });

  const results: BulkPostApplicationActionResult[] = [];
  let skipped = 0;
  let failed = 0;

  for (const item of pendingItems) {
    const { message, matchedJob } = item;

    if (action === "approve") {
      if (!matchedJob) {
        skipped++;
        results.push({
          messageId: message.id,
          ok: false,
          error: {
            code: "NO_SUGGESTED_MATCH",
            message: "Message has no suggested job match",
          },
        });
        continue;
      }

      try {
        const result = await approvePostApplicationInboxItem({
          messageId: message.id,
          provider,
          accountKey,
          jobId: matchedJob.id,
          decidedBy,
        });
        results.push({
          messageId: message.id,
          ok: true,
          message: result.message,
          stageEventId: result.stageEventId,
        });
      } catch (error) {
        if (error instanceof AppError && error.code === "CONFLICT") {
          skipped++;
          results.push({
            messageId: message.id,
            ok: false,
            error: {
              code: "ALREADY_DECIDED",
              message: error.message,
            },
          });
          continue;
        }
        failed++;
        results.push({
          messageId: message.id,
          ok: false,
          error: {
            code: "APPROVE_FAILED",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    } else {
      try {
        const result = await denyPostApplicationInboxItem({
          messageId: message.id,
          provider,
          accountKey,
          decidedBy,
        });
        results.push({
          messageId: message.id,
          ok: true,
          message: result.message,
        });
      } catch (error) {
        if (error instanceof AppError && error.code === "CONFLICT") {
          skipped++;
          results.push({
            messageId: message.id,
            ok: false,
            error: {
              code: "ALREADY_DECIDED",
              message: error.message,
            },
          });
          continue;
        }
        failed++;
        results.push({
          messageId: message.id,
          ok: false,
          error: {
            code: "DENY_FAILED",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }
  }

  const succeeded = results.filter((r) => r.ok).length;

  return {
    action,
    requested: pendingItems.length,
    succeeded,
    failed,
    skipped,
    results,
  };
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

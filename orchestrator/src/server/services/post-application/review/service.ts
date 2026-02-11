import { randomUUID } from "node:crypto";
import { conflict, notFound, unprocessableEntity } from "@infra/errors";
import { db, schema } from "@server/db";
import { getJobById, listJobSummariesByIds } from "@server/repositories/jobs";
import {
  getPostApplicationMessageCandidateById,
  listPostApplicationMessageCandidatesByMessageIds,
} from "@server/repositories/post-application-message-candidates";
import { getLatestPostApplicationMessageLinksByMessageIds } from "@server/repositories/post-application-message-links";
import {
  getPostApplicationMessageById,
  listPostApplicationMessagesByReviewStatus,
  listPostApplicationMessagesBySyncRun,
} from "@server/repositories/post-application-messages";
import {
  getPostApplicationSyncRunById,
  listPostApplicationSyncRuns,
} from "@server/repositories/post-application-sync-runs";
import type {
  ApplicationStage,
  PostApplicationInboxItem,
  PostApplicationMessage,
  PostApplicationMessageCandidate,
  PostApplicationProvider,
  PostApplicationSyncRun,
} from "@shared/types";
import { and, desc, eq, sql } from "drizzle-orm";

const {
  jobs,
  postApplicationMessageLinks,
  postApplicationMessages,
  postApplicationSyncRuns,
  stageEvents,
} = schema;

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

function normalizeLabel(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function inferStageFromClassification(
  label: string | null,
): ApplicationStage | null {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;

  if (normalized === "interview invitation") return "technical_interview";
  if (normalized === "assessment sent") return "assessment";
  if (normalized === "offer made") return "offer";
  if (
    normalized === "rejection" ||
    normalized === "hiring freeze notification" ||
    normalized === "withdrew application"
  ) {
    return "closed";
  }
  if (
    normalized === "availability request" ||
    normalized === "information request" ||
    normalized === "referral - action required"
  ) {
    return "recruiter_screen";
  }

  return null;
}

export async function listPostApplicationInbox(args: {
  provider: PostApplicationProvider;
  accountKey: string;
  limit?: number;
}): Promise<PostApplicationInboxItem[]> {
  const messages = await listPostApplicationMessagesByReviewStatus(
    args.provider,
    args.accountKey,
    "pending_review",
    args.limit ?? 50,
  );

  const messageIds = messages.map((message) => message.id);
  const [candidateRows, latestLinks] = await Promise.all([
    listPostApplicationMessageCandidatesByMessageIds(messageIds),
    getLatestPostApplicationMessageLinksByMessageIds(messageIds),
  ]);
  const jobIds = Array.from(
    new Set(candidateRows.map((candidate) => candidate.jobId)),
  );
  const jobs = await listJobSummariesByIds(jobIds);
  const candidatesByMessageId = buildCandidatesByMessageId(candidateRows, jobs);

  const linkByMessageId = new Map(
    latestLinks.map((link) => [link.messageId, link]),
  );
  const settledMessageIds = new Set(
    latestLinks
      .filter(
        (link) => link.decision === "approved" || link.decision === "denied",
      )
      .map((link) => link.messageId),
  );

  return messages
    .filter((message) => !settledMessageIds.has(message.id))
    .map((message) => ({
      message,
      candidates: candidatesByMessageId.get(message.id) ?? [],
      link: linkByMessageId.get(message.id) ?? null,
    }));
}

function resolveJobIdForDecision(args: {
  message: PostApplicationMessage;
  explicitJobId?: string;
  candidateJobId?: string;
}): string | null {
  if (args.explicitJobId && args.explicitJobId.trim().length > 0) {
    return args.explicitJobId;
  }
  if (args.candidateJobId && args.candidateJobId.trim().length > 0) {
    return args.candidateJobId;
  }
  return args.message.matchedJobId;
}

function buildCandidatesByMessageId(
  candidateRows: PostApplicationMessageCandidate[],
  jobs: Awaited<ReturnType<typeof listJobSummariesByIds>>,
): Map<string, PostApplicationMessageCandidate[]> {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const candidatesByMessageId = new Map<
    string,
    PostApplicationMessageCandidate[]
  >();

  for (const candidate of candidateRows) {
    const job = jobById.get(candidate.jobId);
    const existing = candidatesByMessageId.get(candidate.messageId) ?? [];
    existing.push({
      ...candidate,
      ...(job
        ? {
            job: {
              id: job.id,
              title: job.title,
              employer: job.employer,
            },
          }
        : {}),
    });
    candidatesByMessageId.set(candidate.messageId, existing);
  }

  return candidatesByMessageId;
}

function isUniqueApprovedLinkConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("unique constraint failed") &&
    message.includes("post_application_message_links.message_id")
  );
}

export async function approvePostApplicationInboxItem(args: {
  messageId: string;
  provider: PostApplicationProvider;
  accountKey: string;
  jobId?: string;
  candidateId?: string;
  toStage?: ApplicationStage;
  note?: string;
  decidedBy?: string | null;
}): Promise<{ message: PostApplicationMessage; stageEventId: string }> {
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
  if (message.reviewStatus !== "pending_review") {
    throw conflict(
      `Message '${args.messageId}' is already decided with status '${message.reviewStatus}'.`,
    );
  }

  const candidate = args.candidateId
    ? await getPostApplicationMessageCandidateById(args.candidateId)
    : null;
  if (args.candidateId && (!candidate || candidate.messageId !== message.id)) {
    throw unprocessableEntity(
      `Candidate '${args.candidateId}' is invalid for message '${args.messageId}'.`,
    );
  }

  const resolvedJobId = resolveJobIdForDecision({
    message,
    explicitJobId: args.jobId,
    candidateJobId: candidate?.jobId,
  });
  if (!resolvedJobId) {
    throw unprocessableEntity(
      "Approval requires a resolved jobId from payload, candidate, or message suggestion.",
    );
  }
  if (candidate && candidate.jobId !== resolvedJobId) {
    throw unprocessableEntity(
      `Candidate '${candidate.id}' does not map to job '${resolvedJobId}'.`,
    );
  }

  const targetJob = await getJobById(resolvedJobId);
  if (!targetJob) {
    throw notFound(`Job '${resolvedJobId}' not found.`);
  }

  const approved = db.transaction((tx) => {
    const existingApproved = tx
      .select()
      .from(postApplicationMessageLinks)
      .where(
        and(
          eq(postApplicationMessageLinks.messageId, message.id),
          eq(postApplicationMessageLinks.decision, "approved"),
        ),
      )
      .orderBy(desc(postApplicationMessageLinks.decidedAt))
      .limit(1)
      .get();
    if (existingApproved) {
      throw conflict(
        `Message '${message.id}' already has an approved link decision.`,
      );
    }

    const latestEvent = tx
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
      inferStageFromClassification(message.classificationLabel) ??
      fromStage ??
      "applied";
    const decidedAt = Date.now();
    const occurredAtSeconds = Math.floor(
      Number.isFinite(message.receivedAt)
        ? message.receivedAt / 1000
        : decidedAt / 1000,
    );
    const stageEventId = randomUUID();

    tx.insert(stageEvents)
      .values({
        id: stageEventId,
        applicationId: resolvedJobId,
        title: `Post-application review: ${message.classificationLabel ?? "Update"}`,
        groupId: "post_application_review",
        fromStage,
        toStage: finalToStage,
        occurredAt: occurredAtSeconds,
        metadata: {
          actor: "system",
          eventType: "status_update",
          eventLabel: `Post-application review: ${message.classificationLabel ?? "Update"}`,
          note: args.note ?? null,
          reasonCode: "post_application_approved",
        },
        outcome: null,
      })
      .run();

    try {
      tx.insert(postApplicationMessageLinks)
        .values({
          id: randomUUID(),
          messageId: message.id,
          jobId: resolvedJobId,
          candidateId: candidate?.id ?? null,
          decision: "approved",
          stageEventId,
          decidedAt,
          decidedBy: args.decidedBy ?? null,
          notes: args.note ?? null,
          createdAt: new Date(decidedAt).toISOString(),
        })
        .run();
    } catch (error) {
      if (isUniqueApprovedLinkConflict(error)) {
        throw conflict(
          `Message '${message.id}' already has an approved link decision.`,
        );
      }
      throw error;
    }

    const shouldSetAppliedAt = !targetJob.appliedAt;
    tx.update(jobs)
      .set({
        status: STAGE_TO_JOB_STATUS[finalToStage],
        ...(shouldSetAppliedAt
          ? { appliedAt: new Date(decidedAt).toISOString() }
          : {}),
        updatedAt: new Date(decidedAt).toISOString(),
      })
      .where(eq(jobs.id, resolvedJobId))
      .run();

    tx.update(postApplicationMessages)
      .set({
        reviewStatus: "approved",
        matchedJobId: resolvedJobId,
        decidedAt,
        decidedBy: args.decidedBy ?? null,
        updatedAt: new Date(decidedAt).toISOString(),
      })
      .where(eq(postApplicationMessages.id, message.id))
      .run();

    if (message.syncRunId) {
      tx.update(postApplicationSyncRuns)
        .set({
          messagesApproved: sql`${postApplicationSyncRuns.messagesApproved} + 1`,
          updatedAt: new Date(decidedAt).toISOString(),
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

  return { message: updatedMessage, stageEventId: approved.stageEventId };
}

export async function denyPostApplicationInboxItem(args: {
  messageId: string;
  provider: PostApplicationProvider;
  accountKey: string;
  jobId?: string;
  candidateId?: string;
  note?: string;
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
  if (message.reviewStatus !== "pending_review") {
    throw conflict(
      `Message '${args.messageId}' is already decided with status '${message.reviewStatus}'.`,
    );
  }

  const candidate = args.candidateId
    ? await getPostApplicationMessageCandidateById(args.candidateId)
    : null;
  if (args.candidateId && (!candidate || candidate.messageId !== message.id)) {
    throw unprocessableEntity(
      `Candidate '${args.candidateId}' is invalid for message '${args.messageId}'.`,
    );
  }

  const resolvedJobId = resolveJobIdForDecision({
    message,
    explicitJobId: args.jobId,
    candidateJobId: candidate?.jobId,
  });
  if (!resolvedJobId) {
    throw unprocessableEntity(
      "Deny requires a resolved jobId from payload, candidate, or message suggestion.",
    );
  }

  const job = await getJobById(resolvedJobId);
  if (!job) {
    throw notFound(`Job '${resolvedJobId}' not found.`);
  }

  const decidedAt = Date.now();
  db.transaction((tx) => {
    tx.insert(postApplicationMessageLinks)
      .values({
        id: randomUUID(),
        messageId: message.id,
        jobId: resolvedJobId,
        candidateId: candidate?.id ?? null,
        decision: "denied",
        stageEventId: null,
        decidedAt,
        decidedBy: args.decidedBy ?? null,
        notes: args.note ?? null,
        createdAt: new Date(decidedAt).toISOString(),
      })
      .run();

    tx.update(postApplicationMessages)
      .set({
        reviewStatus: "denied",
        matchedJobId: resolvedJobId,
        decidedAt,
        decidedBy: args.decidedBy ?? null,
        updatedAt: new Date(decidedAt).toISOString(),
      })
      .where(eq(postApplicationMessages.id, message.id))
      .run();

    if (message.syncRunId) {
      tx.update(postApplicationSyncRuns)
        .set({
          messagesDenied: sql`${postApplicationSyncRuns.messagesDenied} + 1`,
          updatedAt: new Date(decidedAt).toISOString(),
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

  const messageIds = messages.map((message) => message.id);
  const [candidateRows, latestLinks] = await Promise.all([
    listPostApplicationMessageCandidatesByMessageIds(messageIds),
    getLatestPostApplicationMessageLinksByMessageIds(messageIds),
  ]);
  const jobIds = Array.from(
    new Set(candidateRows.map((candidate) => candidate.jobId)),
  );
  const jobs = await listJobSummariesByIds(jobIds);
  const candidatesByMessageId = buildCandidatesByMessageId(candidateRows, jobs);

  const linkByMessageId = new Map(
    latestLinks.map((link) => [link.messageId, link]),
  );

  const items = messages.map((message) => ({
    message,
    candidates: candidatesByMessageId.get(message.id) ?? [],
    link: linkByMessageId.get(message.id) ?? null,
  }));

  return { run, items };
}

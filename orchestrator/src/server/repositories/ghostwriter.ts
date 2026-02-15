import { randomUUID } from "node:crypto";
import type {
  JobChatMessage,
  JobChatMessageRole,
  JobChatMessageStatus,
  JobChatRun,
  JobChatRunStatus,
  JobChatThread,
} from "@shared/types";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";

const { jobChatMessages, jobChatRuns, jobChatThreads } = schema;

function mapThread(row: typeof jobChatThreads.$inferSelect): JobChatThread {
  return {
    id: row.id,
    jobId: row.jobId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastMessageAt: row.lastMessageAt,
  };
}

function mapMessage(row: typeof jobChatMessages.$inferSelect): JobChatMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    jobId: row.jobId,
    role: row.role as JobChatMessageRole,
    content: row.content,
    status: row.status as JobChatMessageStatus,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    version: row.version,
    replacesMessageId: row.replacesMessageId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRun(row: typeof jobChatRuns.$inferSelect): JobChatRun {
  return {
    id: row.id,
    threadId: row.threadId,
    jobId: row.jobId,
    status: row.status as JobChatRunStatus,
    model: row.model,
    provider: row.provider,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    requestId: row.requestId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listThreadsForJob(
  jobId: string,
): Promise<JobChatThread[]> {
  const rows = await db
    .select()
    .from(jobChatThreads)
    .where(eq(jobChatThreads.jobId, jobId))
    .orderBy(desc(jobChatThreads.updatedAt));

  return rows.map(mapThread);
}

export async function getOrCreateThreadForJob(input: {
  jobId: string;
  title?: string | null;
}): Promise<JobChatThread> {
  const existing = await listThreadsForJob(input.jobId);
  if (existing.length > 0) {
    return existing[0];
  }
  return createThread({
    jobId: input.jobId,
    title: input.title ?? null,
  });
}

export async function getThreadById(
  threadId: string,
): Promise<JobChatThread | null> {
  const [row] = await db
    .select()
    .from(jobChatThreads)
    .where(eq(jobChatThreads.id, threadId));
  return row ? mapThread(row) : null;
}

export async function getThreadForJob(
  jobId: string,
  threadId: string,
): Promise<JobChatThread | null> {
  const [row] = await db
    .select()
    .from(jobChatThreads)
    .where(
      and(eq(jobChatThreads.id, threadId), eq(jobChatThreads.jobId, jobId)),
    );
  return row ? mapThread(row) : null;
}

export async function createThread(input: {
  jobId: string;
  title?: string | null;
}): Promise<JobChatThread> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(jobChatThreads).values({
    id,
    jobId: input.jobId,
    title: input.title ?? null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  });

  const thread = await getThreadById(id);
  if (!thread) {
    throw new Error(`Failed to load created chat thread ${id}.`);
  }
  return thread;
}

export async function touchThread(
  threadId: string,
  lastMessageAt?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(jobChatThreads)
    .set({
      updatedAt: now,
      ...(lastMessageAt !== undefined ? { lastMessageAt } : {}),
    })
    .where(eq(jobChatThreads.id, threadId));
}

export async function listMessagesForThread(
  threadId: string,
  options?: { limit?: number; offset?: number },
): Promise<JobChatMessage[]> {
  const limit = options?.limit ?? 200;
  const offset = options?.offset ?? 0;

  const rows = await db
    .select()
    .from(jobChatMessages)
    .where(eq(jobChatMessages.threadId, threadId))
    .orderBy(jobChatMessages.createdAt)
    .limit(limit)
    .offset(offset);

  return rows.map(mapMessage);
}

export async function getMessageById(
  messageId: string,
): Promise<JobChatMessage | null> {
  const [row] = await db
    .select()
    .from(jobChatMessages)
    .where(eq(jobChatMessages.id, messageId));
  return row ? mapMessage(row) : null;
}

export async function createMessage(input: {
  threadId: string;
  jobId: string;
  role: JobChatMessageRole;
  content: string;
  status?: JobChatMessageStatus;
  tokensIn?: number | null;
  tokensOut?: number | null;
  version?: number;
  replacesMessageId?: string | null;
}): Promise<JobChatMessage> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(jobChatMessages).values({
    id,
    threadId: input.threadId,
    jobId: input.jobId,
    role: input.role,
    content: input.content,
    status: input.status ?? "partial",
    tokensIn: input.tokensIn ?? null,
    tokensOut: input.tokensOut ?? null,
    version: input.version ?? 1,
    replacesMessageId: input.replacesMessageId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await touchThread(input.threadId, now);

  const created = await getMessageById(id);
  if (!created) {
    throw new Error(`Failed to load created chat message ${id}.`);
  }
  return created;
}

export async function updateMessage(
  messageId: string,
  input: {
    content?: string;
    status?: JobChatMessageStatus;
    tokensIn?: number | null;
    tokensOut?: number | null;
  },
): Promise<JobChatMessage | null> {
  const now = new Date().toISOString();

  await db
    .update(jobChatMessages)
    .set({
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.tokensIn !== undefined ? { tokensIn: input.tokensIn } : {}),
      ...(input.tokensOut !== undefined ? { tokensOut: input.tokensOut } : {}),
      updatedAt: now,
    })
    .where(eq(jobChatMessages.id, messageId));

  const message = await getMessageById(messageId);
  if (message) {
    await touchThread(message.threadId, now);
  }
  return message;
}

export async function getLatestAssistantMessage(
  threadId: string,
): Promise<JobChatMessage | null> {
  const [row] = await db
    .select()
    .from(jobChatMessages)
    .where(
      and(
        eq(jobChatMessages.threadId, threadId),
        eq(jobChatMessages.role, "assistant"),
      ),
    )
    .orderBy(desc(jobChatMessages.createdAt))
    .limit(1);

  return row ? mapMessage(row) : null;
}

export async function createRun(input: {
  threadId: string;
  jobId: string;
  model: string | null;
  provider: string | null;
  requestId?: string | null;
}): Promise<JobChatRun> {
  const id = randomUUID();
  const startedAt = Date.now();
  const now = new Date(startedAt).toISOString();

  await db.insert(jobChatRuns).values({
    id,
    threadId: input.threadId,
    jobId: input.jobId,
    status: "running",
    model: input.model,
    provider: input.provider,
    errorCode: null,
    errorMessage: null,
    startedAt,
    completedAt: null,
    requestId: input.requestId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const run = await getRunById(id);
  if (!run) {
    throw new Error(`Failed to load created chat run ${id}.`);
  }
  return run;
}

export async function getRunById(runId: string): Promise<JobChatRun | null> {
  const [row] = await db
    .select()
    .from(jobChatRuns)
    .where(eq(jobChatRuns.id, runId));
  return row ? mapRun(row) : null;
}

export async function getActiveRunForThread(
  threadId: string,
): Promise<JobChatRun | null> {
  const [row] = await db
    .select()
    .from(jobChatRuns)
    .where(
      and(
        eq(jobChatRuns.threadId, threadId),
        eq(jobChatRuns.status, "running"),
      ),
    )
    .orderBy(desc(jobChatRuns.startedAt))
    .limit(1);

  return row ? mapRun(row) : null;
}

export async function completeRun(
  runId: string,
  input: {
    status: Exclude<JobChatRunStatus, "running">;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<JobChatRun | null> {
  const nowEpoch = Date.now();
  const nowIso = new Date(nowEpoch).toISOString();

  await db
    .update(jobChatRuns)
    .set({
      status: input.status,
      completedAt: nowEpoch,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      updatedAt: nowIso,
    })
    .where(eq(jobChatRuns.id, runId));

  return getRunById(runId);
}

export async function completeRunIfRunning(
  runId: string,
  input: {
    status: Exclude<JobChatRunStatus, "running">;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<JobChatRun | null> {
  const nowEpoch = Date.now();
  const nowIso = new Date(nowEpoch).toISOString();

  await db
    .update(jobChatRuns)
    .set({
      status: input.status,
      completedAt: nowEpoch,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      updatedAt: nowIso,
    })
    .where(and(eq(jobChatRuns.id, runId), eq(jobChatRuns.status, "running")));

  return getRunById(runId);
}

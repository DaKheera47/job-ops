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
    activeRootMessageId: row.activeRootMessageId,
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
    parentMessageId: row.parentMessageId,
    activeChildId: row.activeChildId,
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
  parentMessageId?: string | null;
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
    parentMessageId: input.parentMessageId ?? null,
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

export async function deleteAllMessagesForThread(
  threadId: string,
): Promise<number> {
  const result = await db
    .delete(jobChatMessages)
    .where(eq(jobChatMessages.threadId, threadId));

  return result.changes;
}

export async function deleteAllRunsForThread(
  threadId: string,
): Promise<number> {
  const result = await db
    .delete(jobChatRuns)
    .where(eq(jobChatRuns.threadId, threadId));

  return result.changes;
}

/**
 * Set the active root message for a thread (for branch navigation of root messages).
 */
export async function setActiveRoot(
  threadId: string,
  messageId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(jobChatThreads)
    .set({ activeRootMessageId: messageId, updatedAt: now })
    .where(eq(jobChatThreads.id, threadId));
}

/**
 * Set the active child pointer on a parent message (for branch navigation).
 */
export async function setActiveChild(
  messageId: string,
  activeChildId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(jobChatMessages)
    .set({ activeChildId, updatedAt: now })
    .where(eq(jobChatMessages.id, messageId));
}

/**
 * Get all children of a message, ordered by createdAt.
 */
export async function getChildrenOfMessage(
  parentMessageId: string,
): Promise<JobChatMessage[]> {
  const rows = await db
    .select()
    .from(jobChatMessages)
    .where(eq(jobChatMessages.parentMessageId, parentMessageId))
    .orderBy(jobChatMessages.createdAt);
  return rows.map(mapMessage);
}

/**
 * Get siblings of a message (all children of the same parent) and which index is active.
 */
export async function getSiblingsOf(
  messageId: string,
): Promise<{ siblings: JobChatMessage[]; activeIndex: number }> {
  const message = await getMessageById(messageId);
  if (!message) {
    return { siblings: [], activeIndex: 0 };
  }

  // Root messages: siblings are all root messages in the same thread
  if (!message.parentMessageId) {
    const allInThread = await db
      .select()
      .from(jobChatMessages)
      .where(
        and(
          eq(jobChatMessages.threadId, message.threadId),
          eq(jobChatMessages.role, message.role),
        ),
      )
      .orderBy(jobChatMessages.createdAt);
    const rootSiblings = allInThread
      .map(mapMessage)
      .filter((m) => !m.parentMessageId);

    if (rootSiblings.length <= 1) {
      return { siblings: rootSiblings, activeIndex: 0 };
    }

    // Active root determined by thread's activeRootMessageId
    const thread = await getThreadById(message.threadId);
    const activeId = thread?.activeRootMessageId ?? messageId;
    const activeIndex = Math.max(
      0,
      rootSiblings.findIndex((s) => s.id === activeId),
    );
    return { siblings: rootSiblings, activeIndex };
  }

  const parent = await getMessageById(message.parentMessageId);
  const siblings = await getChildrenOfMessage(message.parentMessageId);

  // The active child is determined by the parent's activeChildId pointer
  const activeId = parent?.activeChildId ?? messageId;
  const activeIndex = Math.max(
    0,
    siblings.findIndex((s) => s.id === activeId),
  );

  return { siblings, activeIndex };
}

/**
 * Walk the tree from root to leaf following activeChildId pointers.
 * Returns the "active path" — the conversation the user currently sees.
 */
export async function getActivePathFromRoot(
  threadId: string,
): Promise<JobChatMessage[]> {
  // Load all messages for this thread into memory (fine for typical sizes)
  const allRows = await db
    .select()
    .from(jobChatMessages)
    .where(eq(jobChatMessages.threadId, threadId))
    .orderBy(jobChatMessages.createdAt);
  const all = allRows.map(mapMessage);

  if (all.length === 0) return [];

  // Build lookup maps
  const byId = new Map<string, JobChatMessage>();
  const childrenOf = new Map<string, JobChatMessage[]>();

  for (const msg of all) {
    byId.set(msg.id, msg);
    const parentId = msg.parentMessageId;
    if (parentId) {
      const existing = childrenOf.get(parentId) ?? [];
      existing.push(msg);
      childrenOf.set(parentId, existing);
    }
  }

  // Find root(s) — messages with no parent
  const roots = all.filter((m) => !m.parentMessageId);
  if (roots.length === 0) {
    // Fallback for legacy data without parentMessageId backfill
    return all;
  }

  // Pick the active root: use thread's activeRootMessageId, fall back to newest
  const thread = await getThreadById(threadId);
  const preferredRootId = thread?.activeRootMessageId;
  const activeRoot = preferredRootId
    ? roots.find((r) => r.id === preferredRootId)
    : undefined;

  // Walk from root following activeChildId, falling back to newest child
  const path: JobChatMessage[] = [];
  let currentMsg: JobChatMessage | undefined =
    activeRoot ?? roots[roots.length - 1];

  while (currentMsg) {
    path.push(currentMsg);
    const children = childrenOf.get(currentMsg.id);
    if (!children || children.length === 0) break;

    // Follow activeChildId if set, otherwise pick newest
    const wantId: string | null = currentMsg.activeChildId;
    const next: JobChatMessage | undefined = wantId
      ? children.find((c) => c.id === wantId)
      : undefined;
    currentMsg = next ?? children[children.length - 1];
  }

  return path;
}

/**
 * Walk from a message up to the root via parentMessageId.
 * Returns messages in chronological order (root first).
 */
export async function getAncestorPath(
  messageId: string,
): Promise<JobChatMessage[]> {
  const path: JobChatMessage[] = [];
  let currentId: string | null = messageId;

  while (currentId) {
    const msg = await getMessageById(currentId);
    if (!msg) break;
    path.unshift(msg); // prepend — we're walking backwards
    currentId = msg.parentMessageId;
  }

  return path;
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

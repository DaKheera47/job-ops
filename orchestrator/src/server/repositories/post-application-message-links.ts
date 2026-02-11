import { randomUUID } from "node:crypto";
import type {
  PostApplicationLinkDecision,
  PostApplicationMessageLink,
} from "@shared/types";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";

const { postApplicationMessageLinks } = schema;

type CreatePostApplicationMessageLinkInput = {
  messageId: string;
  jobId: string;
  candidateId?: string | null;
  decision: PostApplicationLinkDecision;
  stageEventId?: string | null;
  decidedAt?: number;
  decidedBy?: string | null;
  notes?: string | null;
};

function mapRowToMessageLink(
  row: typeof postApplicationMessageLinks.$inferSelect,
): PostApplicationMessageLink {
  return {
    id: row.id,
    messageId: row.messageId,
    jobId: row.jobId,
    candidateId: row.candidateId,
    decision: row.decision as PostApplicationLinkDecision,
    stageEventId: row.stageEventId,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export async function createPostApplicationMessageLink(
  input: CreatePostApplicationMessageLinkInput,
): Promise<PostApplicationMessageLink> {
  const id = randomUUID();
  const decidedAt = input.decidedAt ?? Date.now();
  const createdAt = new Date(decidedAt).toISOString();

  await db.insert(postApplicationMessageLinks).values({
    id,
    messageId: input.messageId,
    jobId: input.jobId,
    candidateId: input.candidateId ?? null,
    decision: input.decision,
    stageEventId: input.stageEventId ?? null,
    decidedAt,
    decidedBy: input.decidedBy ?? null,
    notes: input.notes ?? null,
    createdAt,
  });

  const link = await getPostApplicationMessageLinkById(id);
  if (!link) {
    throw new Error(
      `Failed to load created post-application message link ${id}.`,
    );
  }
  return link;
}

export async function getPostApplicationMessageLinkById(
  id: string,
): Promise<PostApplicationMessageLink | null> {
  const [row] = await db
    .select()
    .from(postApplicationMessageLinks)
    .where(eq(postApplicationMessageLinks.id, id));

  return row ? mapRowToMessageLink(row) : null;
}

export async function getLatestPostApplicationMessageLinkByMessageId(
  messageId: string,
): Promise<PostApplicationMessageLink | null> {
  const [row] = await db
    .select()
    .from(postApplicationMessageLinks)
    .where(eq(postApplicationMessageLinks.messageId, messageId))
    .orderBy(desc(postApplicationMessageLinks.decidedAt))
    .limit(1);

  return row ? mapRowToMessageLink(row) : null;
}

export async function getLatestPostApplicationMessageLinksByMessageIds(
  messageIds: string[],
): Promise<PostApplicationMessageLink[]> {
  if (messageIds.length === 0) return [];

  const rows = await db
    .select()
    .from(postApplicationMessageLinks)
    .where(inArray(postApplicationMessageLinks.messageId, messageIds))
    .orderBy(
      asc(postApplicationMessageLinks.messageId),
      desc(postApplicationMessageLinks.decidedAt),
    );

  const byMessage = new Map<string, PostApplicationMessageLink>();
  for (const row of rows) {
    if (byMessage.has(row.messageId)) continue;
    byMessage.set(row.messageId, mapRowToMessageLink(row));
  }

  return [...byMessage.values()];
}

export async function getApprovedPostApplicationMessageLink(
  messageId: string,
): Promise<PostApplicationMessageLink | null> {
  const [row] = await db
    .select()
    .from(postApplicationMessageLinks)
    .where(
      and(
        eq(postApplicationMessageLinks.messageId, messageId),
        eq(postApplicationMessageLinks.decision, "approved"),
      ),
    )
    .orderBy(desc(postApplicationMessageLinks.decidedAt))
    .limit(1);

  return row ? mapRowToMessageLink(row) : null;
}

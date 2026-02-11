import { randomUUID } from "node:crypto";
import type {
  PostApplicationMatchMethod,
  PostApplicationMessageCandidate,
} from "@shared/types";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";

const { postApplicationMessageCandidates } = schema;

type ReplaceMessageCandidatesInput = {
  messageId: string;
  candidates: Array<{
    jobId: string;
    score: number;
    rank: number;
    reasons: string[] | null;
    matchMethod: PostApplicationMatchMethod;
    isHighConfidence: boolean;
  }>;
};

function mapRowToCandidate(
  row: typeof postApplicationMessageCandidates.$inferSelect,
): PostApplicationMessageCandidate {
  return {
    id: row.id,
    messageId: row.messageId,
    jobId: row.jobId,
    score: row.score,
    rank: row.rank,
    reasons: (row.reasons as string[] | null) ?? null,
    matchMethod: row.matchMethod as PostApplicationMatchMethod,
    isHighConfidence: Boolean(row.isHighConfidence),
    createdAt: row.createdAt,
  };
}

export async function replacePostApplicationMessageCandidates(
  input: ReplaceMessageCandidatesInput,
): Promise<PostApplicationMessageCandidate[]> {
  const nowIso = new Date().toISOString();

  await db
    .delete(postApplicationMessageCandidates)
    .where(eq(postApplicationMessageCandidates.messageId, input.messageId));

  if (input.candidates.length === 0) {
    return [];
  }

  await db.insert(postApplicationMessageCandidates).values(
    input.candidates.map((candidate) => ({
      id: randomUUID(),
      messageId: input.messageId,
      jobId: candidate.jobId,
      score: candidate.score,
      rank: candidate.rank,
      reasons: candidate.reasons,
      matchMethod: candidate.matchMethod,
      isHighConfidence: candidate.isHighConfidence,
      createdAt: nowIso,
    })),
  );

  const rows = await db
    .select()
    .from(postApplicationMessageCandidates)
    .where(eq(postApplicationMessageCandidates.messageId, input.messageId))
    .orderBy(asc(postApplicationMessageCandidates.rank));
  return rows.map(mapRowToCandidate);
}

export async function listPostApplicationMessageCandidatesByMessageIds(
  messageIds: string[],
): Promise<PostApplicationMessageCandidate[]> {
  if (messageIds.length === 0) return [];

  const rows = await db
    .select()
    .from(postApplicationMessageCandidates)
    .where(inArray(postApplicationMessageCandidates.messageId, messageIds))
    .orderBy(
      asc(postApplicationMessageCandidates.messageId),
      asc(postApplicationMessageCandidates.rank),
    );

  return rows.map(mapRowToCandidate);
}

export async function getPostApplicationMessageCandidateById(
  id: string,
): Promise<PostApplicationMessageCandidate | null> {
  const [row] = await db
    .select()
    .from(postApplicationMessageCandidates)
    .where(eq(postApplicationMessageCandidates.id, id));
  return row ? mapRowToCandidate(row) : null;
}

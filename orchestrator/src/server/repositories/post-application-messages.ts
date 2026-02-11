import { randomUUID } from "node:crypto";
import type {
  PostApplicationMessage,
  PostApplicationProvider,
  PostApplicationRelevanceDecision,
  PostApplicationReviewStatus,
} from "@shared/types";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";

const { postApplicationMessages } = schema;

type UpsertPostApplicationMessageInput = {
  provider: PostApplicationProvider;
  accountKey: string;
  integrationId: string | null;
  syncRunId: string | null;
  externalMessageId: string;
  externalThreadId?: string | null;
  fromAddress: string;
  fromDomain?: string | null;
  senderName?: string | null;
  subject: string;
  receivedAt: number;
  snippet: string;
  classificationLabel?: string | null;
  classificationConfidence?: number | null;
  classificationPayload?: Record<string, unknown> | null;
  relevanceKeywordScore: number;
  relevanceLlmScore?: number | null;
  relevanceFinalScore: number;
  relevanceDecision: PostApplicationRelevanceDecision;
  reviewStatus: PostApplicationReviewStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
};

type UpdatePostApplicationMessageSuggestionInput = {
  id: string;
  matchedJobId: string | null;
  reviewStatus: PostApplicationReviewStatus;
};

type UpdatePostApplicationMessageReviewDecisionInput = {
  id: string;
  reviewStatus: Extract<PostApplicationReviewStatus, "approved" | "denied">;
  matchedJobId: string | null;
  decidedAt?: number;
  decidedBy?: string | null;
};

function mapRowToPostApplicationMessage(
  row: typeof postApplicationMessages.$inferSelect,
): PostApplicationMessage {
  return {
    id: row.id,
    provider: row.provider,
    accountKey: row.accountKey,
    integrationId: row.integrationId,
    syncRunId: row.syncRunId,
    externalMessageId: row.externalMessageId,
    externalThreadId: row.externalThreadId,
    fromAddress: row.fromAddress,
    fromDomain: row.fromDomain,
    senderName: row.senderName,
    subject: row.subject,
    receivedAt: row.receivedAt,
    snippet: row.snippet,
    classificationLabel: row.classificationLabel,
    classificationConfidence: row.classificationConfidence,
    classificationPayload:
      (row.classificationPayload as Record<string, unknown> | null) ?? null,
    relevanceKeywordScore: row.relevanceKeywordScore,
    relevanceLlmScore: row.relevanceLlmScore,
    relevanceFinalScore: row.relevanceFinalScore,
    relevanceDecision:
      row.relevanceDecision as PostApplicationRelevanceDecision,
    reviewStatus: row.reviewStatus as PostApplicationReviewStatus,
    matchedJobId: row.matchedJobId,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getPostApplicationMessageByExternalId(
  provider: PostApplicationProvider,
  accountKey: string,
  externalMessageId: string,
): Promise<PostApplicationMessage | null> {
  const [row] = await db
    .select()
    .from(postApplicationMessages)
    .where(
      and(
        eq(postApplicationMessages.provider, provider),
        eq(postApplicationMessages.accountKey, accountKey),
        eq(postApplicationMessages.externalMessageId, externalMessageId),
      ),
    );
  return row ? mapRowToPostApplicationMessage(row) : null;
}

export async function getPostApplicationMessageById(
  id: string,
): Promise<PostApplicationMessage | null> {
  const [row] = await db
    .select()
    .from(postApplicationMessages)
    .where(eq(postApplicationMessages.id, id));
  return row ? mapRowToPostApplicationMessage(row) : null;
}

export async function upsertPostApplicationMessage(
  input: UpsertPostApplicationMessageInput,
): Promise<PostApplicationMessage> {
  const nowIso = new Date().toISOString();
  const existing = await getPostApplicationMessageByExternalId(
    input.provider,
    input.accountKey,
    input.externalMessageId,
  );

  if (existing) {
    await db
      .update(postApplicationMessages)
      .set({
        integrationId: input.integrationId,
        syncRunId: input.syncRunId,
        externalThreadId: input.externalThreadId ?? null,
        fromAddress: input.fromAddress,
        fromDomain: input.fromDomain ?? null,
        senderName: input.senderName ?? null,
        subject: input.subject,
        receivedAt: input.receivedAt,
        snippet: input.snippet,
        classificationLabel: input.classificationLabel ?? null,
        classificationConfidence: input.classificationConfidence ?? null,
        classificationPayload: input.classificationPayload ?? null,
        relevanceKeywordScore: input.relevanceKeywordScore,
        relevanceLlmScore: input.relevanceLlmScore ?? null,
        relevanceFinalScore: input.relevanceFinalScore,
        relevanceDecision: input.relevanceDecision,
        reviewStatus: input.reviewStatus,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        updatedAt: nowIso,
      })
      .where(eq(postApplicationMessages.id, existing.id));

    const updated = await getPostApplicationMessageByExternalId(
      input.provider,
      input.accountKey,
      input.externalMessageId,
    );
    if (!updated) {
      throw new Error(
        `Failed to load updated post-application message ${input.externalMessageId}.`,
      );
    }
    return updated;
  }

  const id = randomUUID();
  await db.insert(postApplicationMessages).values({
    id,
    provider: input.provider,
    accountKey: input.accountKey,
    integrationId: input.integrationId,
    syncRunId: input.syncRunId,
    externalMessageId: input.externalMessageId,
    externalThreadId: input.externalThreadId ?? null,
    fromAddress: input.fromAddress,
    fromDomain: input.fromDomain ?? null,
    senderName: input.senderName ?? null,
    subject: input.subject,
    receivedAt: input.receivedAt,
    snippet: input.snippet,
    classificationLabel: input.classificationLabel ?? null,
    classificationConfidence: input.classificationConfidence ?? null,
    classificationPayload: input.classificationPayload ?? null,
    relevanceKeywordScore: input.relevanceKeywordScore,
    relevanceLlmScore: input.relevanceLlmScore ?? null,
    relevanceFinalScore: input.relevanceFinalScore,
    relevanceDecision: input.relevanceDecision,
    reviewStatus: input.reviewStatus,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const created = await getPostApplicationMessageByExternalId(
    input.provider,
    input.accountKey,
    input.externalMessageId,
  );
  if (!created) {
    throw new Error(
      `Failed to load created post-application message ${input.externalMessageId}.`,
    );
  }
  return created;
}

export async function updatePostApplicationMessageSuggestion(
  input: UpdatePostApplicationMessageSuggestionInput,
): Promise<PostApplicationMessage | null> {
  const nowIso = new Date().toISOString();
  await db
    .update(postApplicationMessages)
    .set({
      matchedJobId: input.matchedJobId,
      reviewStatus: input.reviewStatus,
      updatedAt: nowIso,
    })
    .where(eq(postApplicationMessages.id, input.id));

  const [row] = await db
    .select()
    .from(postApplicationMessages)
    .where(eq(postApplicationMessages.id, input.id));
  return row ? mapRowToPostApplicationMessage(row) : null;
}

export async function listPostApplicationMessagesByReviewStatus(
  provider: PostApplicationProvider,
  accountKey: string,
  reviewStatus: PostApplicationReviewStatus,
  limit = 50,
): Promise<PostApplicationMessage[]> {
  const rows = await db
    .select()
    .from(postApplicationMessages)
    .where(
      and(
        eq(postApplicationMessages.provider, provider),
        eq(postApplicationMessages.accountKey, accountKey),
        eq(postApplicationMessages.reviewStatus, reviewStatus),
      ),
    )
    .orderBy(desc(postApplicationMessages.receivedAt))
    .limit(limit);

  return rows.map(mapRowToPostApplicationMessage);
}

export async function updatePostApplicationMessageReviewDecision(
  input: UpdatePostApplicationMessageReviewDecisionInput,
): Promise<PostApplicationMessage | null> {
  const decidedAt = input.decidedAt ?? Date.now();
  const nowIso = new Date(decidedAt).toISOString();

  await db
    .update(postApplicationMessages)
    .set({
      reviewStatus: input.reviewStatus,
      matchedJobId: input.matchedJobId,
      decidedAt,
      decidedBy: input.decidedBy ?? null,
      updatedAt: nowIso,
    })
    .where(eq(postApplicationMessages.id, input.id));

  const [row] = await db
    .select()
    .from(postApplicationMessages)
    .where(eq(postApplicationMessages.id, input.id));
  return row ? mapRowToPostApplicationMessage(row) : null;
}

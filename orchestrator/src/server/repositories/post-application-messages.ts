import { randomUUID } from "node:crypto";
import type {
  PostApplicationJobEmailItem,
  PostApplicationMessage,
  PostApplicationMessageType,
  PostApplicationProcessingStatus,
  PostApplicationProvider,
  PostApplicationRelevanceDecision,
  PostApplicationRouterStageTarget,
} from "@shared/types";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import {
  normalizeStageTarget,
  stageTargetFromMessageType,
} from "../services/post-application/stage-target";
import {
  getPrivateDataScope,
  privateDataScopeFilter,
} from "../tenancy/private-scope";

const { postApplicationIntegrations, postApplicationMessages } = schema;

function messagesScopeFilter() {
  return privateDataScopeFilter(postApplicationMessages);
}

function integrationsScopeFilter() {
  return privateDataScopeFilter(postApplicationIntegrations);
}

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
  relevanceLlmScore?: number | null;
  relevanceDecision: PostApplicationRelevanceDecision;
  matchConfidence?: number | null;
  stageTarget?: PostApplicationRouterStageTarget | null;
  messageType: PostApplicationMessageType;
  stageEventPayload?: Record<string, unknown> | null;
  processingStatus: PostApplicationProcessingStatus;
  matchedJobId?: string | null;
  decidedAt?: number | null;
  decidedBy?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  existingMessage?: PostApplicationMessage | null;
};

type UpdatePostApplicationMessageSuggestionInput = {
  id: string;
  matchedJobId: string | null;
  matchConfidence?: number | null;
  processingStatus: PostApplicationProcessingStatus;
};

type UpdatePostApplicationMessageDecisionInput = {
  id: string;
  processingStatus: Extract<
    PostApplicationProcessingStatus,
    "manual_linked" | "ignored"
  >;
  matchedJobId: string | null;
  decidedAt?: number;
  decidedBy?: string | null;
};

export type UpsertPostApplicationMessageResult = {
  message: PostApplicationMessage;
  wasCreated: boolean;
  previousProcessingStatus: PostApplicationProcessingStatus | null;
  autoLinkTransitioned: boolean;
};

type PostApplicationIntegrationDisplayMetadata = {
  id: string;
  provider: PostApplicationProvider;
  accountKey: string;
  displayName: string | null;
};

export type ListPostApplicationMessagesForJobResult = {
  items: Array<Omit<PostApplicationJobEmailItem, "sourceUrl">>;
  total: number;
};

function isTerminalProcessingStatus(
  status: PostApplicationProcessingStatus,
): boolean {
  return status !== "pending_user";
}

function mapRowToPostApplicationMessage(
  row: typeof postApplicationMessages.$inferSelect,
): PostApplicationMessage {
  const stageEventPayload =
    (row.stageEventPayload as Record<string, unknown> | null) ?? null;
  const stageTarget =
    normalizeStageTarget(stageEventPayload?.suggestedStageTarget) ??
    normalizeStageTarget(row.classificationLabel) ??
    stageTargetFromMessageType(row.messageType as PostApplicationMessageType);

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
    relevanceLlmScore: row.relevanceLlmScore,
    relevanceDecision:
      row.relevanceDecision as PostApplicationRelevanceDecision,
    matchedJobId: row.matchedJobId,
    matchConfidence: row.matchConfidence,
    stageTarget,
    messageType: row.messageType as PostApplicationMessageType,
    stageEventPayload,
    processingStatus: row.processingStatus as PostApplicationProcessingStatus,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function integrationKey(
  provider: PostApplicationProvider,
  accountKey: string,
): string {
  return `${provider}:${accountKey}`;
}

async function listIntegrationDisplayMetadata(): Promise<
  PostApplicationIntegrationDisplayMetadata[]
> {
  const rows = await db
    .select({
      id: postApplicationIntegrations.id,
      provider: postApplicationIntegrations.provider,
      accountKey: postApplicationIntegrations.accountKey,
      displayName: postApplicationIntegrations.displayName,
    })
    .from(postApplicationIntegrations)
    .where(integrationsScopeFilter());

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    accountKey: row.accountKey,
    displayName: row.displayName,
  }));
}

export async function getPostApplicationMessageByExternalId(
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
        messagesScopeFilter(),
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
    .where(and(messagesScopeFilter(), eq(postApplicationMessages.id, id)));
  return row ? mapRowToPostApplicationMessage(row) : null;
}

export async function upsertPostApplicationMessage(
  input: UpsertPostApplicationMessageInput,
): Promise<UpsertPostApplicationMessageResult> {
  const stageTarget =
    input.stageTarget ??
    normalizeStageTarget(input.classificationLabel) ??
    stageTargetFromMessageType(input.messageType);
  const stageEventPayload = {
    ...(input.stageEventPayload ?? {}),
    suggestedStageTarget: stageTarget,
  };
  const nowIso = new Date().toISOString();
  const scope = getPrivateDataScope();
  const existing =
    input.existingMessage ??
    (await getPostApplicationMessageByExternalId(
      input.provider,
      input.accountKey,
      input.externalMessageId,
    ));

  if (existing) {
    const nextProcessingStatus = isTerminalProcessingStatus(
      existing.processingStatus,
    )
      ? existing.processingStatus
      : input.processingStatus;
    const autoLinkTransitioned =
      existing.processingStatus !== "auto_linked" &&
      nextProcessingStatus === "auto_linked";

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
        relevanceLlmScore: input.relevanceLlmScore ?? null,
        relevanceDecision: input.relevanceDecision,
        matchConfidence: input.matchConfidence ?? null,
        messageType: input.messageType,
        stageEventPayload,
        processingStatus: nextProcessingStatus,
        matchedJobId: input.matchedJobId ?? null,
        decidedAt: input.decidedAt ?? null,
        decidedBy: input.decidedBy ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        updatedAt: nowIso,
      })
      .where(
        and(messagesScopeFilter(), eq(postApplicationMessages.id, existing.id)),
      );

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
    return {
      message: updated,
      wasCreated: false,
      previousProcessingStatus: existing.processingStatus,
      autoLinkTransitioned,
    };
  }

  const id = randomUUID();
  await db.insert(postApplicationMessages).values({
    id,
    tenantId: scope.tenantId,
    userId: scope.userId,
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
    relevanceLlmScore: input.relevanceLlmScore ?? null,
    relevanceDecision: input.relevanceDecision,
    matchConfidence: input.matchConfidence ?? null,
    messageType: input.messageType,
    stageEventPayload,
    processingStatus: input.processingStatus,
    matchedJobId: input.matchedJobId ?? null,
    decidedAt: input.decidedAt ?? null,
    decidedBy: input.decidedBy ?? null,
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
  return {
    message: created,
    wasCreated: true,
    previousProcessingStatus: null,
    autoLinkTransitioned: input.processingStatus === "auto_linked",
  };
}

export async function updatePostApplicationMessageSuggestion(
  input: UpdatePostApplicationMessageSuggestionInput,
): Promise<PostApplicationMessage | null> {
  const nowIso = new Date().toISOString();
  await db
    .update(postApplicationMessages)
    .set({
      matchedJobId: input.matchedJobId,
      ...(input.matchConfidence !== undefined
        ? { matchConfidence: input.matchConfidence }
        : {}),
      processingStatus: input.processingStatus,
      updatedAt: nowIso,
    })
    .where(
      and(messagesScopeFilter(), eq(postApplicationMessages.id, input.id)),
    );

  const [row] = await db
    .select()
    .from(postApplicationMessages)
    .where(
      and(messagesScopeFilter(), eq(postApplicationMessages.id, input.id)),
    );
  return row ? mapRowToPostApplicationMessage(row) : null;
}

export async function listPostApplicationMessagesByProcessingStatus(
  provider: PostApplicationProvider,
  accountKey: string,
  processingStatus: PostApplicationProcessingStatus,
  limit = 50,
): Promise<PostApplicationMessage[]> {
  const rows = await db
    .select()
    .from(postApplicationMessages)
    .where(
      and(
        eq(postApplicationMessages.provider, provider),
        eq(postApplicationMessages.accountKey, accountKey),
        eq(postApplicationMessages.processingStatus, processingStatus),
        messagesScopeFilter(),
      ),
    )
    .orderBy(desc(postApplicationMessages.receivedAt))
    .limit(limit);

  return rows.map(mapRowToPostApplicationMessage);
}

export async function listPostApplicationMessagesBySyncRun(
  provider: PostApplicationProvider,
  accountKey: string,
  syncRunId: string,
  limit = 300,
): Promise<PostApplicationMessage[]> {
  const rows = await db
    .select()
    .from(postApplicationMessages)
    .where(
      and(
        eq(postApplicationMessages.provider, provider),
        eq(postApplicationMessages.accountKey, accountKey),
        eq(postApplicationMessages.syncRunId, syncRunId),
        messagesScopeFilter(),
      ),
    )
    .orderBy(desc(postApplicationMessages.receivedAt))
    .limit(limit);

  return rows.map(mapRowToPostApplicationMessage);
}

export async function listPostApplicationMessagesForJob(
  jobId: string,
  limit = 100,
): Promise<ListPostApplicationMessagesForJobResult> {
  const whereClause = and(
    messagesScopeFilter(),
    eq(postApplicationMessages.matchedJobId, jobId),
  );
  const rows = await db
    .select()
    .from(postApplicationMessages)
    .where(whereClause)
    .orderBy(desc(postApplicationMessages.receivedAt))
    .limit(limit);
  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(postApplicationMessages)
    .where(whereClause);

  const integrations = await listIntegrationDisplayMetadata();
  const integrationsById = new Map(
    integrations.map((integration) => [integration.id, integration]),
  );
  const integrationsByProviderAccount = new Map(
    integrations.map((integration) => [
      integrationKey(integration.provider, integration.accountKey),
      integration,
    ]),
  );

  return {
    items: rows.map((row) => {
      const message = mapRowToPostApplicationMessage(row);
      const integration =
        (message.integrationId
          ? integrationsById.get(message.integrationId)
          : undefined) ??
        integrationsByProviderAccount.get(
          integrationKey(message.provider, message.accountKey),
        );

      return {
        message,
        accountDisplayName: integration?.displayName ?? null,
      };
    }),
    total: countRow?.total ?? 0,
  };
}

export async function listPostApplicationMessagesForJobByIds(
  jobId: string,
  messageIds: readonly string[],
): Promise<Array<Omit<PostApplicationJobEmailItem, "sourceUrl">>> {
  const ids = Array.from(
    new Set(messageIds.map((id) => id.trim()).filter(Boolean)),
  );
  if (ids.length === 0) return [];

  const rows = await db
    .select()
    .from(postApplicationMessages)
    .where(
      and(
        messagesScopeFilter(),
        eq(postApplicationMessages.matchedJobId, jobId),
        inArray(postApplicationMessages.id, ids),
      ),
    );

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const integrations = await listIntegrationDisplayMetadata();
  const integrationsById = new Map(
    integrations.map((integration) => [integration.id, integration]),
  );
  const integrationsByProviderAccount = new Map(
    integrations.map((integration) => [
      integrationKey(integration.provider, integration.accountKey),
      integration,
    ]),
  );

  return ids
    .map((id) => rowsById.get(id))
    .filter((row): row is typeof postApplicationMessages.$inferSelect =>
      Boolean(row),
    )
    .map((row) => {
      const message = mapRowToPostApplicationMessage(row);
      const integration =
        (message.integrationId
          ? integrationsById.get(message.integrationId)
          : undefined) ??
        integrationsByProviderAccount.get(
          integrationKey(message.provider, message.accountKey),
        );

      return {
        message,
        accountDisplayName: integration?.displayName ?? null,
      };
    });
}

export async function updatePostApplicationMessageDecision(
  input: UpdatePostApplicationMessageDecisionInput,
): Promise<PostApplicationMessage | null> {
  const decidedAt = input.decidedAt ?? Date.now();
  const nowIso = new Date(decidedAt).toISOString();

  await db
    .update(postApplicationMessages)
    .set({
      processingStatus: input.processingStatus,
      matchedJobId: input.matchedJobId,
      decidedAt,
      decidedBy: input.decidedBy ?? null,
      updatedAt: nowIso,
    })
    .where(
      and(messagesScopeFilter(), eq(postApplicationMessages.id, input.id)),
    );

  const [row] = await db
    .select()
    .from(postApplicationMessages)
    .where(
      and(messagesScopeFilter(), eq(postApplicationMessages.id, input.id)),
    );
  return row ? mapRowToPostApplicationMessage(row) : null;
}

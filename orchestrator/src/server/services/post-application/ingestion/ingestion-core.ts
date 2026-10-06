import { logger } from "@infra/logger";
import { trackServerProductEvent } from "@infra/product-analytics";
import { getAllJobs } from "@server/repositories/jobs";
import {
  getPostApplicationIntegration,
  updatePostApplicationIntegrationSyncState,
} from "@server/repositories/post-application-integrations";
import {
  getPostApplicationMessageByExternalId,
  upsertPostApplicationMessage,
} from "@server/repositories/post-application-messages";
import {
  completePostApplicationSyncRun,
  startPostApplicationSyncRun,
} from "@server/repositories/post-application-sync-runs";
import { transitionStage } from "@server/services/applicationTracking";
import { resolveStageTransitionForTarget } from "@server/services/post-application/stage-target";
import type {
  PostApplicationIntegration,
  PostApplicationProvider,
  PostApplicationRouterStageTarget,
} from "@shared/types";
import { classifyWithSmartRouter, minifyActiveJobs } from "./email-router";

export const DEFAULT_SEARCH_DAYS = 90;
export const DEFAULT_MAX_MESSAGES = 100;

export type IngestionSyncSummary = {
  discovered: number;
  relevant: number;
  classified: number;
  errored: number;
};

// A message as seen by the shared loop, independent of Gmail/IMAP wire format.
export type IngestionMessageRef = { id: string; threadId: string };
export type IngestionMessageMeta = {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
};

export function buildEmailText(input: {
  from: string;
  subject: string;
  date: string;
  body: string;
}): string {
  return `From: ${input.from}
Subject: ${input.subject}
Date: ${input.date}
Body:
${input.body}`.trim();
}

export type IngestionTransport = {
  listMessages(
    searchDays: number,
    maxMessages: number,
  ): Promise<IngestionMessageRef[]>;
  getMetadata(id: string): Promise<IngestionMessageMeta>;
  getBody(id: string): Promise<string>;
  close?(): Promise<void>;
};

function parseFromHeader(fromHeader: string): {
  fromAddress: string;
  fromDomain: string | null;
  senderName: string | null;
} {
  const match = fromHeader.match(/^(.*?)<([^>]+)>$/);
  const senderName = match?.[1]?.trim() || null;
  const fromAddress = (match?.[2] || fromHeader).trim().toLowerCase();
  const atIndex = fromAddress.indexOf("@");
  const fromDomain =
    atIndex > 0 ? fromAddress.slice(atIndex + 1).toLowerCase() : null;

  return { fromAddress, fromDomain, senderName };
}

function parseReceivedAt(dateHeader: string): number {
  const parsed = Date.parse(dateHeader);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function resolveProcessingStatus(input: {
  isAutoLinked: boolean;
  isPendingMatch: boolean;
  isRelevantOrphan: boolean;
}): "auto_linked" | "pending_user" | "ignored" {
  if (input.isAutoLinked) return "auto_linked";
  if (input.isPendingMatch || input.isRelevantOrphan) return "pending_user";
  return "ignored";
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

async function createAutoStageEvent(args: {
  provider: PostApplicationProvider;
  jobId: string;
  stageTarget: PostApplicationRouterStageTarget;
  receivedAt: number;
  note: string;
}): Promise<void> {
  void trackServerProductEvent(
    "tracking_email_matched",
    {
      provider: args.provider,
      match_mode: "auto_link",
      stage_target: args.stageTarget,
      result: "success",
    },
    { urlPath: "/tracking-inbox" },
  );

  const transition = resolveStageTransitionForTarget(args.stageTarget);
  if (transition.toStage === "no_change") return;

  const eventLabel =
    args.stageTarget === "applied"
      ? "Email received"
      : `Logged from email: ${args.stageTarget}`;

  transitionStage(
    args.jobId,
    transition.toStage,
    Math.floor(args.receivedAt / 1000),
    {
      actor: "system",
      eventType: "status_update",
      eventLabel,
      note: args.note,
      reasonCode: transition.reasonCode ?? "post_application_auto_linked",
    },
    transition.outcome,
  );
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, concurrency) }).map(
    async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await worker(next);
      }
    },
  );
  await Promise.all(workers);
}

// Transport-agnostic sync loop. The provider wrapper authenticates and builds
// the transport; everything below (routing, dedup, DB upsert, stage events) is
// identical for Gmail and IMAP.
export async function runIngestionSync(args: {
  provider: PostApplicationProvider;
  accountKey: string;
  integration: PostApplicationIntegration;
  transport: IngestionTransport;
  maxMessages: number;
  searchDays: number;
}): Promise<IngestionSyncSummary> {
  const { provider, accountKey, integration, transport } = args;
  const searchDays = Math.max(1, args.searchDays);
  const maxMessages = Math.max(1, args.maxMessages);

  const syncRun = await startPostApplicationSyncRun({
    provider,
    accountKey,
    integrationId: integration.id,
  });

  let discovered = 0;
  let relevant = 0;
  let classified = 0;
  let matched = 0;
  let errored = 0;

  try {
    const messageIds = await transport.listMessages(searchDays, maxMessages);
    const activeJobs = await getAllJobs([
      "applied",
      "in_progress",
      "processing",
    ]);
    const activeJobMinified = minifyActiveJobs(activeJobs);
    const activeJobIds = new Set(activeJobMinified.map((job) => job.id));
    const concurrency = Math.max(
      1,
      Number.parseInt(
        process.env.POST_APPLICATION_ROUTER_CONCURRENCY ?? "3",
        10,
      ) || 3,
    );

    await runWithConcurrency(messageIds, concurrency, async (message) => {
      discovered += 1;

      try {
        const metadata = await transport.getMetadata(message.id);
        const { fromAddress, fromDomain, senderName } = parseFromHeader(
          metadata.from,
        );
        const receivedAt = parseReceivedAt(metadata.date);
        const existingMessage = await getPostApplicationMessageByExternalId(
          provider,
          accountKey,
          metadata.id,
        );

        if (existingMessage) {
          const { message: savedMessage, autoLinkTransitioned } =
            await upsertPostApplicationMessage({
              provider,
              accountKey,
              integrationId: integration.id,
              syncRunId: syncRun.id,
              externalMessageId: metadata.id,
              externalThreadId: metadata.threadId,
              fromAddress,
              fromDomain,
              senderName,
              subject: metadata.subject,
              receivedAt,
              snippet: metadata.snippet,
              classificationLabel: existingMessage.classificationLabel,
              classificationConfidence:
                existingMessage.classificationConfidence,
              classificationPayload: existingMessage.classificationPayload,
              relevanceLlmScore: existingMessage.relevanceLlmScore,
              relevanceDecision: existingMessage.relevanceDecision,
              matchedJobId: existingMessage.matchedJobId,
              matchConfidence: existingMessage.matchConfidence,
              stageTarget: existingMessage.stageTarget,
              messageType: existingMessage.messageType,
              stageEventPayload: existingMessage.stageEventPayload,
              processingStatus: existingMessage.processingStatus,
              existingMessage,
            });

          if (savedMessage.processingStatus !== "ignored") {
            relevant += 1;
          }
          classified += 1;
          if (savedMessage.matchedJobId) {
            matched += 1;
          }

          if (autoLinkTransitioned && savedMessage.matchedJobId) {
            await createAutoStageEvent({
              provider,
              jobId: savedMessage.matchedJobId,
              stageTarget: savedMessage.stageTarget ?? "no_change",
              receivedAt: savedMessage.receivedAt,
              note: "Auto-created from Smart Router.",
            });
          }
          return;
        }

        const body = await transport.getBody(message.id);
        const emailText = buildEmailText({
          from: metadata.from,
          subject: metadata.subject,
          date: metadata.date,
          body,
        });
        const routerResult = await classifyWithSmartRouter({
          emailText,
          activeJobs: activeJobMinified,
        });

        const matchedJobId =
          routerResult.bestMatchId && activeJobIds.has(routerResult.bestMatchId)
            ? routerResult.bestMatchId
            : null;
        const isAutoLinked = routerResult.confidence >= 95 && matchedJobId;
        const isPendingMatch = routerResult.confidence >= 50;
        const isRelevantOrphan = routerResult.isRelevant;
        const processingStatus = resolveProcessingStatus({
          isAutoLinked: Boolean(isAutoLinked),
          isPendingMatch,
          isRelevantOrphan,
        });

        const { message: savedMessage, autoLinkTransitioned } =
          await upsertPostApplicationMessage({
            provider,
            accountKey,
            integrationId: integration.id,
            syncRunId: syncRun.id,
            externalMessageId: metadata.id,
            externalThreadId: metadata.threadId,
            fromAddress,
            fromDomain,
            senderName,
            subject: metadata.subject,
            receivedAt,
            snippet: metadata.snippet,
            classificationLabel: routerResult.stageTarget,
            classificationConfidence: routerResult.confidence / 100,
            classificationPayload: {
              method: "smart_router",
              reason: routerResult.reason,
              stageTarget: routerResult.stageTarget,
            },
            relevanceLlmScore: routerResult.confidence,
            relevanceDecision: routerResult.isRelevant
              ? "relevant"
              : "not_relevant",
            matchedJobId: isAutoLinked || isPendingMatch ? matchedJobId : null,
            matchConfidence: routerResult.confidence,
            stageTarget: routerResult.stageTarget,
            messageType: routerResult.messageType,
            stageEventPayload: routerResult.stageEventPayload,
            processingStatus,
          });

        if (savedMessage.processingStatus !== "ignored") {
          relevant += 1;
        }
        classified += 1;
        if (savedMessage.matchedJobId) {
          matched += 1;
        }

        if (autoLinkTransitioned && savedMessage.matchedJobId) {
          await createAutoStageEvent({
            provider,
            jobId: savedMessage.matchedJobId,
            stageTarget: savedMessage.stageTarget ?? "no_change",
            receivedAt: savedMessage.receivedAt,
            note: "Auto-created from Smart Router.",
          });
        }
      } catch (error) {
        errored += 1;
        logger.warn("Failed to ingest post-application message", {
          provider,
          accountKey,
          externalMessageId: message.id,
          syncRunId: syncRun.id,
          error: normalizeErrorMessage(error),
        });
      }
    });

    await completePostApplicationSyncRun({
      id: syncRun.id,
      status: "completed",
      messagesDiscovered: discovered,
      messagesRelevant: relevant,
      messagesClassified: classified,
      messagesMatched: matched,
      messagesErrored: errored,
    });
    await updatePostApplicationIntegrationSyncState({
      provider,
      accountKey,
      lastSyncedAt: Date.now(),
      lastError: null,
      status: "connected",
    });

    return { discovered, relevant, classified, errored };
  } catch (error) {
    const errorMessage = normalizeErrorMessage(error);
    await completePostApplicationSyncRun({
      id: syncRun.id,
      status: "failed",
      messagesDiscovered: discovered,
      messagesRelevant: relevant,
      messagesClassified: classified,
      messagesMatched: matched,
      messagesErrored: errored,
      errorCode: `${provider.toUpperCase()}_SYNC_FAILED`,
      errorMessage,
    });
    await updatePostApplicationIntegrationSyncState({
      provider,
      accountKey,
      lastSyncedAt: Date.now(),
      lastError: errorMessage,
      status: "error",
    });

    throw error;
  } finally {
    await transport.close?.();
  }
}

export async function loadConnectedIntegration(
  provider: PostApplicationProvider,
  accountKey: string,
): Promise<PostApplicationIntegration> {
  const integration = await getPostApplicationIntegration(provider, accountKey);
  if (!integration) {
    throw new Error(`${provider} account '${accountKey}' is not connected.`);
  }
  return integration;
}

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
import type { PostApplicationRouterStageTarget } from "@shared/types";
import { classifyWithSmartRouter, minifyActiveJobs } from "./email-router";
import type { ImapCredentials, ImapMessage } from "./imap-api";
import {
  buildEmailText,
  getMessagesFull,
  listMessageIds,
} from "./imap-api";

const DEFAULT_SEARCH_DAYS = 90;
const DEFAULT_MAX_MESSAGES = 100;

export type ImapSyncSummary = {
  discovered: number;
  relevant: number;
  classified: number;
  errored: number;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseImapCredentials(
  credentials: Record<string, unknown> | null,
): ImapCredentials | null {
  if (!credentials) return null;

  const host = asString(credentials.host);
  const user = asString(credentials.user);
  const password = asString(credentials.password);

  if (!host || !user || !password) return null;

  const port =
    typeof credentials.port === "number" && Number.isFinite(credentials.port)
      ? credentials.port
      : 993;

  const tls =
    typeof credentials.tls === "boolean" ? credentials.tls : true;

  return {
    host,
    port,
    user,
    password,
    tls,
  };
}

function parseFromAddress(fromAddress: string): {
  fromAddress: string;
  fromDomain: string | null;
} {
  const normalized = fromAddress.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  const fromDomain =
    atIndex > 0 ? normalized.slice(atIndex + 1).toLowerCase() : null;

  return { fromAddress: normalized, fromDomain };
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
  jobId: string;
  stageTarget: PostApplicationRouterStageTarget;
  receivedAt: number;
  note: string;
}): Promise<void> {
  void trackServerProductEvent(
    "tracking_email_matched",
    {
      provider: "imap",
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

export async function runImapIngestionSync(args: {
  accountKey: string;
  maxMessages?: number;
  searchDays?: number;
}): Promise<ImapSyncSummary> {
  const integration = await getPostApplicationIntegration(
    "imap",
    args.accountKey,
  );
  const parsedCredentials = parseImapCredentials(
    integration?.credentials ?? null,
  );
  if (!integration || !parsedCredentials) {
    throw new Error(`IMAP account '${args.accountKey}' is not connected.`);
  }

  const searchDays = Math.max(1, args.searchDays ?? DEFAULT_SEARCH_DAYS);
  const maxMessages = Math.max(1, args.maxMessages ?? DEFAULT_MAX_MESSAGES);

  const syncRun = await startPostApplicationSyncRun({
    provider: "imap",
    accountKey: args.accountKey,
    integrationId: integration.id,
  });

  let discovered = 0;
  let relevant = 0;
  let classified = 0;
  let matched = 0;
  let errored = 0;

  try {
    logger.info("Starting IMAP sync", {
      provider: "imap",
      accountKey: args.accountKey,
      integrationId: integration.id,
      syncRunId: syncRun.id,
      searchDays,
      maxMessages,
    });

    // Step 1: List message UIDs matching search criteria
    const uids = await listMessageIds(parsedCredentials, searchDays);
    discovered = uids.length;

    logger.info("IMAP messages discovered", {
      provider: "imap",
      accountKey: args.accountKey,
      syncRunId: syncRun.id,
      discovered,
    });

    if (uids.length === 0) {
      await completePostApplicationSyncRun({
        id: syncRun.id,
        status: "completed",
        messagesDiscovered: 0,
        messagesRelevant: 0,
        messagesClassified: 0,
        messagesMatched: 0,
        messagesErrored: 0,
      });
      return { discovered: 0, relevant: 0, classified: 0, errored: 0 };
    }

    // Step 2: Fetch full message details
    const messages = await getMessagesFull(
      parsedCredentials,
      uids,
      maxMessages,
    );

    logger.info("IMAP messages fetched", {
      provider: "imap",
      accountKey: args.accountKey,
      syncRunId: syncRun.id,
      fetched: messages.length,
    });

    // Step 3: Process each message
    const activeJobs = await getAllJobs();
    const minifiedJobs = minifyActiveJobs(activeJobs);

    await runWithConcurrency(
      messages,
      3, // Process 3 messages concurrently
      async (message: ImapMessage) => {
        try {
          const externalMessageId = `imap-${parsedCredentials.host}-${message.id}`;

          // Check if message already exists
          const existing = await getPostApplicationMessageByExternalId(
            "imap",
            args.accountKey,
            externalMessageId,
          );

          if (existing) {
            logger.debug("Skipping existing IMAP message", {
              provider: "imap",
              accountKey: args.accountKey,
              externalMessageId,
            });
            return;
          }

          // Build email text for classification
          const emailText = buildEmailText(message);

          // Classify with smart router
          const classification = await classifyWithSmartRouter({
            emailText,
            activeJobs: minifiedJobs,
          });

          const isRelevant = classification.isRelevant;
          const matchConfidence = classification.confidence;
          const isAutoLinked = isRelevant && matchConfidence >= 0.95;
          const isPendingMatch =
            isRelevant && matchConfidence >= 0.5 && matchConfidence < 0.95;
          const isRelevantOrphan = isRelevant && matchConfidence < 0.5;

          if (isRelevant) {
            relevant++;
          }

          if (classification.messageType !== "other") {
            classified++;
          }

          if (isAutoLinked) {
            matched++;
          }

          // Parse from address
          const { fromAddress, fromDomain } = parseFromAddress(message.from);
          const receivedAt = message.receivedDate.getTime();

          // Store message
          const storedMessage = await upsertPostApplicationMessage({
            provider: "imap",
            accountKey: args.accountKey,
            integrationId: integration.id,
            syncRunId: syncRun.id,
            externalMessageId,
            externalThreadId: null,
            fromAddress,
            fromDomain,
            senderName: message.fromName,
            subject: message.subject,
            receivedAt,
            snippet: message.bodyPreview,
            classificationLabel: null,
            classificationConfidence: null,
            classificationPayload: null,
            relevanceLlmScore: null,
            relevanceDecision: classification.isRelevant
              ? "relevant"
              : "not_relevant",
            matchedJobId: classification.bestMatchId,
            matchConfidence: classification.confidence,
            stageTarget: classification.stageTarget,
            messageType: classification.messageType,
            stageEventPayload: null,
            processingStatus: resolveProcessingStatus({
              isAutoLinked,
              isPendingMatch,
              isRelevantOrphan,
            }),
          });

          // Create auto stage event if high confidence match
          if (
            isAutoLinked &&
            classification.bestMatchId &&
            classification.stageTarget &&
            classification.stageTarget !== "no_change"
          ) {
            await createAutoStageEvent({
              jobId: classification.bestMatchId,
              stageTarget: classification.stageTarget,
              receivedAt,
              note: `Auto-linked from IMAP: ${message.subject}`,
            });

            logger.info("IMAP message auto-linked", {
              provider: "imap",
              accountKey: args.accountKey,
              messageId: storedMessage,
              jobId: classification.bestMatchId,
              stageTarget: classification.stageTarget,
              matchConfidence,
            });
          }
        } catch (error) {
          errored++;
          logger.error("Failed to process IMAP message", {
            provider: "imap",
            accountKey: args.accountKey,
            messageId: message.id,
            error: normalizeErrorMessage(error),
          });
        }
      },
    );

    // Step 4: Complete sync run
    await completePostApplicationSyncRun({
      id: syncRun.id,
      status: "completed",
      messagesDiscovered: discovered,
      messagesRelevant: relevant,
      messagesClassified: classified,
      messagesMatched: matched,
      messagesErrored: errored,
    });

    await updatePostApplicationIntegrationSyncState(integration.id, {
      lastSyncedAt: Date.now(),
      lastError: null,
    });

    logger.info("IMAP sync completed", {
      provider: "imap",
      accountKey: args.accountKey,
      syncRunId: syncRun.id,
      discovered,
      relevant,
      classified,
      matched,
      errored,
    });

    return { discovered, relevant, classified, errored };
  } catch (error) {
    errored++;
    const errorMessage = normalizeErrorMessage(error);

    await completePostApplicationSyncRun({
      id: syncRun.id,
      status: "failed",
      messagesDiscovered: discovered,
      messagesRelevant: relevant,
      messagesClassified: classified,
      messagesMatched: matched,
      messagesErrored: errored,
      errorMessage,
    });

    await updatePostApplicationIntegrationSyncState(integration.id, {
      lastError: errorMessage,
    });

    logger.error("IMAP sync failed", {
      provider: "imap",
      accountKey: args.accountKey,
      syncRunId: syncRun.id,
      error: errorMessage,
    });

    throw error;
  }
}

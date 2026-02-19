import { requestTimeout } from "@infra/errors";
import { logger } from "@infra/logger";
import { getAllJobs } from "@server/repositories/jobs";
import {
  getPostApplicationIntegration,
  updatePostApplicationIntegrationSyncState,
  upsertConnectedPostApplicationIntegration,
} from "@server/repositories/post-application-integrations";
import { upsertPostApplicationMessage } from "@server/repositories/post-application-messages";
import {
  completePostApplicationSyncRun,
  startPostApplicationSyncRun,
} from "@server/repositories/post-application-sync-runs";
import { getSetting } from "@server/repositories/settings";
import { transitionStage } from "@server/services/applicationTracking";
import {
  type JsonSchemaDefinition,
  LlmService,
} from "@server/services/llm-service";
import {
  messageTypeFromStageTarget,
  normalizeStageTarget,
  resolveStageTransitionForTarget,
} from "@server/services/post-application/stage-target";
import {
  type Job,
  POST_APPLICATION_ROUTER_STAGE_TARGETS,
  type PostApplicationMessageType,
  type PostApplicationRouterStageTarget,
} from "@shared/types";
import { convert } from "html-to-text";

const DEFAULT_SEARCH_DAYS = 90;
const DEFAULT_MAX_MESSAGES = 100;
const GMAIL_HTTP_TIMEOUT_MS = 15_000;
const ROUTER_EMAIL_CHAR_LIMIT = 12_000;

const SMART_ROUTER_SCHEMA: JsonSchemaDefinition = {
  name: "post_application_email_router",
  schema: {
    type: "object",
    properties: {
      bestMatchIndex: {
        type: ["integer", "null"],
        description:
          "Best matching active-job index from provided list (1-based), or null.",
      },
      confidence: {
        type: "integer",
        description: "Confidence score 0-100 for routing decision.",
      },
      stageTarget: {
        type: "string",
        enum: [...POST_APPLICATION_ROUTER_STAGE_TARGETS],
        description:
          "Normalized stage target for this message, matching Log Event options.",
      },
      isRelevant: {
        type: "boolean",
        description:
          "Whether this is a relevant recruitment/application email.",
      },
      stageEventPayload: {
        type: ["object", "null"],
        description: "Structured metadata for a potential stage event.",
        additionalProperties: true,
      },
      reason: {
        type: "string",
        description: "One sentence reason for the routing decision.",
      },
    },
    required: [
      "bestMatchIndex",
      "confidence",
      "stageTarget",
      "isRelevant",
      "stageEventPayload",
      "reason",
    ],
    additionalProperties: false,
  },
};

type GmailCredentials = {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
  email?: string;
};

type GmailListMessage = {
  id: string;
  threadId: string;
};

type GmailHeader = { name?: string; value?: string };

type GmailMetadataMessage = {
  id: string;
  threadId: string;
  snippet: string;
  headers: GmailHeader[];
};

type GmailFullMessage = GmailMetadataMessage & {
  payload?: {
    mimeType?: string;
    body?: { data?: string };
    parts?: Array<{
      mimeType?: string;
      body?: { data?: string };
      parts?: unknown[];
    }>;
  };
};

type SmartRouterResult = {
  bestMatchId: string | null;
  confidence: number;
  stageTarget: PostApplicationRouterStageTarget;
  messageType: PostApplicationMessageType;
  isRelevant: boolean;
  stageEventPayload: Record<string, unknown> | null;
  reason: string;
};

function resolveProcessingStatus(input: {
  isAutoLinked: boolean;
  isPendingMatch: boolean;
  isRelevantOrphan: boolean;
}): "auto_linked" | "pending_user" | "ignored" {
  if (input.isAutoLinked) return "auto_linked";
  if (input.isPendingMatch || input.isRelevantOrphan) return "pending_user";
  return "ignored";
}

type IndexedActiveJob = {
  index: number;
  id: string;
  company: string;
  title: string;
};

export type GmailSyncSummary = {
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

function parseGmailCredentials(
  credentials: Record<string, unknown> | null,
): GmailCredentials | null {
  if (!credentials) return null;
  const refreshToken = asString(credentials.refreshToken);
  if (!refreshToken) return null;

  const accessToken = asString(credentials.accessToken) ?? undefined;
  const expiryDate =
    typeof credentials.expiryDate === "number" &&
    Number.isFinite(credentials.expiryDate)
      ? credentials.expiryDate
      : undefined;

  return {
    refreshToken,
    accessToken,
    expiryDate,
    scope: asString(credentials.scope) ?? undefined,
    tokenType: asString(credentials.tokenType) ?? undefined,
    email: asString(credentials.email) ?? undefined,
  };
}

export async function resolveGmailAccessToken(
  credentials: GmailCredentials,
): Promise<GmailCredentials> {
  const now = Date.now();
  if (
    credentials.accessToken &&
    credentials.expiryDate &&
    credentials.expiryDate > now + 60_000
  ) {
    return credentials;
  }

  const clientId = asString(process.env.GMAIL_OAUTH_CLIENT_ID);
  const clientSecret = asString(process.env.GMAIL_OAUTH_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GMAIL_OAUTH_CLIENT_ID or GMAIL_OAUTH_CLIENT_SECRET for Gmail token refresh.",
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken,
  });

  const response = await fetchWithTimeout(
    "https://oauth2.googleapis.com/token",
    {
      timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    },
  );
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Gmail token refresh failed with HTTP ${response.status}.`);
  }

  const accessToken = asString(data?.access_token);
  const expiresIn =
    typeof data?.expires_in === "number" && Number.isFinite(data.expires_in)
      ? data.expires_in
      : 3600;
  if (!accessToken) {
    throw new Error(
      "Gmail token refresh response did not include access_token.",
    );
  }

  return {
    ...credentials,
    accessToken,
    expiryDate: Date.now() + expiresIn * 1000,
  };
}

export async function gmailApi<T>(token: string, url: string): Promise<T> {
  const response = await fetchWithTimeout(url, {
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
    init: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Gmail API request failed (${response.status}).`);
  }
  return data as T;
}

async function fetchWithTimeout(
  url: string,
  args: { timeoutMs: number; init: RequestInit },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    return await fetch(url, {
      ...args.init,
      signal: controller.signal,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      throw requestTimeout(
        `Gmail request timed out after ${args.timeoutMs}ms for ${url}.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildGmailQuery(searchDays: number): string {
  const subjectTerms = [
    "application",
    "thank you for applying",
    "thanks for applying",
    "application received",
    "application submitted",
    "your application",
    "interview",
    "assessment",
    "coding challenge",
    "take-home",
    "availability",
    "offer",
    "offer letter",
    "referral",
    "recruiter",
    "hiring team",
    "regret to inform",
    "not moving forward",
    "not selected",
    "application unsuccessful",
    "moving forward with other candidates",
    "unable to proceed",
    "position has been filled",
    "hiring freeze",
    "position on hold",
    "withdrawn",
  ];
  const fromTerms = [
    "careers@",
    "jobs@",
    "recruiting@",
    "talent@",
    "no-reply@greenhouse.io",
    "no-reply@us.greenhouse-mail.io",
    "no-reply@ashbyhq.com",
    "notification@smartrecruiters.com",
    "@smartrecruiters.com",
    "@workablemail.com",
    "@hire.lever.co",
    "@myworkday.com",
    "@workdaymail.com",
    "@greenhouse.io",
    "@ashbyhq.com",
  ];
  const excludeSubjectTerms = [
    "newsletter",
    "webinar",
    "course",
    "discount",
    "event invitation",
    "job search council",
    "matched new opportunities",
  ];

  const quoteTerm = (value: string) => `"${value.replace(/"/g, '\\"')}"`;
  const subjectBlock = subjectTerms
    .map((term) => `subject:${quoteTerm(term)}`)
    .join(" OR ");
  const fromBlock = fromTerms
    .map((term) => `from:${quoteTerm(term)}`)
    .join(" OR ");
  const excludeClauses = excludeSubjectTerms
    .map((term) => `-subject:${quoteTerm(term)}`)
    .join(" ");

  return `newer_than:${searchDays}d ((${subjectBlock}) OR (${fromBlock})) ${excludeClauses}`.trim();
}

async function listMessageIds(
  token: string,
  searchDays: number,
  maxMessages: number,
): Promise<GmailListMessage[]> {
  const messages: GmailListMessage[] = [];
  let pageToken: string | undefined;

  do {
    const q = encodeURIComponent(buildGmailQuery(searchDays));
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${Math.min(
      100,
      maxMessages,
    )}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;

    const page = await gmailApi<{
      messages?: Array<{ id?: string; threadId?: string }>;
      nextPageToken?: string;
    }>(token, listUrl);

    for (const message of page.messages ?? []) {
      if (!message.id || !message.threadId) continue;
      messages.push({ id: message.id, threadId: message.threadId });
      if (messages.length >= maxMessages) {
        return messages;
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken && messages.length < maxMessages);

  return messages;
}

function headerValue(headers: GmailHeader[], name: string): string {
  const found = headers.find(
    (header) => (header.name ?? "").toLowerCase() === name.toLowerCase(),
  );
  return String(found?.value ?? "");
}

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

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function cleanEmailHtmlForLlm(htmlContent: string): string {
  return convert(htmlContent, {
    wordwrap: 130,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { ignoreHref: true } },
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
    ],
  });
}

function normalizeChunkForDedup(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function decodeTextPart(
  part: NonNullable<GmailFullMessage["payload"]>,
): string {
  const data = part.body?.data;
  if (!data) return "";
  const decoded = decodeBase64Url(data);
  const mimeType = String(part.mimeType ?? "").toLowerCase();
  if (mimeType.includes("text/html")) {
    return cleanEmailHtmlForLlm(decoded);
  }
  if (mimeType.startsWith("text/")) {
    return decoded;
  }
  return "";
}

function extractBodyText(payload: GmailFullMessage["payload"]): string {
  if (!payload) return "";
  const chunks: string[] = [];
  const seen = new Set<string>();
  const addChunk = (value: string): void => {
    const chunk = value.trim();
    if (!chunk) return;
    const normalized = normalizeChunkForDedup(chunk);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    chunks.push(chunk);
  };

  const walk = (part: NonNullable<GmailFullMessage["payload"]>): void => {
    const mimeType = String(part.mimeType ?? "").toLowerCase();

    if (mimeType === "multipart/alternative") {
      const children = (part.parts ?? []) as Array<
        NonNullable<GmailFullMessage["payload"]>
      >;
      const plainChild = children.find(
        (child) => String(child.mimeType ?? "").toLowerCase() === "text/plain",
      );
      const plainText = plainChild ? decodeTextPart(plainChild).trim() : "";
      if (plainText.length > 50) {
        addChunk(plainText);
        return;
      }

      if (plainText) {
        addChunk(plainText);
        return;
      }

      const htmlChild = children.find((child) =>
        String(child.mimeType ?? "")
          .toLowerCase()
          .includes("text/html"),
      );
      if (htmlChild) {
        addChunk(decodeTextPart(htmlChild));
        return;
      }
    }

    const chunk = decodeTextPart(part);
    if (chunk) {
      addChunk(chunk);
    }

    for (const child of part.parts ?? []) {
      walk(child as NonNullable<GmailFullMessage["payload"]>);
    }
  };

  walk(payload);
  return chunks.join("\n\n").trim();
}

export const __test__ = {
  extractBodyText,
  buildEmailText,
};

function buildEmailText(input: {
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

function minifyActiveJobs(jobs: Job[]): Array<{
  id: string;
  company: string;
  title: string;
}> {
  return jobs.map((job) => ({
    id: job.id,
    company: job.employer,
    title: job.title,
  }));
}

function sanitizeJobPromptValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildIndexedActiveJobs(
  jobs: Array<{ id: string; company: string; title: string }>,
): IndexedActiveJob[] {
  return jobs.map((job, offset) => ({
    index: offset + 1,
    id: job.id,
    company: sanitizeJobPromptValue(job.company || "Unknown company"),
    title: sanitizeJobPromptValue(job.title || "Unknown title"),
  }));
}

function buildCompactActiveJobsList(jobs: IndexedActiveJob[]): string {
  return jobs
    .map((job) => `${job.index}. ${job.company}: ${job.title}`)
    .join("\n");
}

function normalizeBestMatchIndex(value: unknown, max: number): number | null {
  if (value === null || value === undefined || max <= 0) return null;
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < 1 || rounded > max) return null;
  return rounded;
}

async function classifyWithSmartRouter(args: {
  emailText: string;
  activeJobs: Array<{ id: string; company: string; title: string }>;
}): Promise<SmartRouterResult> {
  const overrideModel = await getSetting("model");
  const model =
    overrideModel || process.env.MODEL || "google/gemini-3-flash-preview";
  const llmEmailText = args.emailText.slice(0, ROUTER_EMAIL_CHAR_LIMIT);
  const indexedActiveJobs = buildIndexedActiveJobs(args.activeJobs);
  const compactActiveJobsList = buildCompactActiveJobsList(indexedActiveJobs);
  const messages = [
    {
      role: "system" as const,
      content:
        "You are a smart router for post-application emails. Return only strict JSON. Ignore sensitive data and include only routing fields.",
    },
    {
      role: "user" as const,
      content: `Route this email to one active job if possible.
- Choose bestMatchIndex only from listed job numbers (1-based), or null.
- confidence is 0..100.
- stageTarget must be one of: ${POST_APPLICATION_ROUTER_STAGE_TARGETS.join("|")}.
- isRelevant should be true for recruitment/application lifecycle emails.
- stageEventPayload should be minimal structured data or null.

Active jobs (index. company: title):
${compactActiveJobsList}

Email:
${llmEmailText}`,
    },
  ];

  const llm = new LlmService();
  const result = await llm.callJson<{
    bestMatchIndex: number | null;
    confidence: number;
    stageTarget: string;
    isRelevant: boolean;
    stageEventPayload: Record<string, unknown> | null;
    reason: string;
  }>({
    model,
    messages,
    jsonSchema: SMART_ROUTER_SCHEMA,
    maxRetries: 1,
    retryDelayMs: 400,
  });

  if (!result.success) {
    throw new Error(`LLM classification failed: ${result.error}`);
  }

  const confidence = Math.max(
    0,
    Math.min(100, Math.round(Number(result.data.confidence) || 0)),
  );
  const bestMatchIndex = normalizeBestMatchIndex(
    result.data.bestMatchIndex,
    indexedActiveJobs.length,
  );
  const bestMatchId =
    bestMatchIndex !== null
      ? (indexedActiveJobs[bestMatchIndex - 1]?.id ?? null)
      : null;
  const stageTarget =
    normalizeStageTarget(result.data.stageTarget) ?? "no_change";
  const messageType = messageTypeFromStageTarget(stageTarget);

  return {
    bestMatchId,
    confidence,
    stageTarget,
    messageType,
    isRelevant: Boolean(result.data.isRelevant),
    stageEventPayload:
      result.data.stageEventPayload &&
      typeof result.data.stageEventPayload === "object"
        ? result.data.stageEventPayload
        : null,
    reason: String(result.data.reason ?? "").trim(),
  };
}

async function getMessageMetadata(
  token: string,
  messageId: string,
): Promise<GmailMetadataMessage> {
  const message = await gmailApi<{
    id?: string;
    threadId?: string;
    snippet?: string;
    payload?: { headers?: GmailHeader[] };
  }>(
    token,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
      messageId,
    )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
  );

  return {
    id: message.id ?? messageId,
    threadId: message.threadId ?? "",
    snippet: message.snippet ?? "",
    headers: message.payload?.headers ?? [],
  };
}

async function getMessageFull(
  token: string,
  messageId: string,
): Promise<GmailFullMessage> {
  const message = await gmailApi<{
    id?: string;
    threadId?: string;
    snippet?: string;
    payload?: GmailFullMessage["payload"];
  }>(
    token,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
      messageId,
    )}?format=full`,
  );

  return {
    id: message.id ?? messageId,
    threadId: message.threadId ?? "",
    snippet: message.snippet ?? "",
    headers: [],
    payload: message.payload,
  };
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

export async function runGmailIngestionSync(args: {
  accountKey: string;
  maxMessages?: number;
  searchDays?: number;
}): Promise<GmailSyncSummary> {
  const integration = await getPostApplicationIntegration(
    "gmail",
    args.accountKey,
  );
  const parsedCredentials = parseGmailCredentials(
    integration?.credentials ?? null,
  );
  if (!integration || !parsedCredentials) {
    throw new Error(`Gmail account '${args.accountKey}' is not connected.`);
  }

  const searchDays = Math.max(1, args.searchDays ?? DEFAULT_SEARCH_DAYS);
  const maxMessages = Math.max(1, args.maxMessages ?? DEFAULT_MAX_MESSAGES);

  const syncRun = await startPostApplicationSyncRun({
    provider: "gmail",
    accountKey: args.accountKey,
    integrationId: integration.id,
  });

  let discovered = 0;
  let relevant = 0;
  let classified = 0;
  let matched = 0;
  let errored = 0;

  try {
    const resolvedCredentials =
      await resolveGmailAccessToken(parsedCredentials);
    if (!resolvedCredentials.accessToken) {
      throw new Error("Gmail sync failed to resolve access token.");
    }
    const accessToken = resolvedCredentials.accessToken;

    if (
      resolvedCredentials.accessToken !== parsedCredentials.accessToken ||
      resolvedCredentials.expiryDate !== parsedCredentials.expiryDate
    ) {
      await upsertConnectedPostApplicationIntegration({
        provider: "gmail",
        accountKey: args.accountKey,
        displayName: integration.displayName,
        credentials: {
          refreshToken: resolvedCredentials.refreshToken,
          accessToken: resolvedCredentials.accessToken,
          expiryDate: resolvedCredentials.expiryDate,
          scope: resolvedCredentials.scope,
          tokenType: resolvedCredentials.tokenType,
          email: resolvedCredentials.email,
        },
      });
    }

    const messageIds = await listMessageIds(
      accessToken,
      searchDays,
      maxMessages,
    );
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
        const metadata = await getMessageMetadata(accessToken, message.id);
        const from = headerValue(metadata.headers, "From");
        const subject = headerValue(metadata.headers, "Subject");
        const date = headerValue(metadata.headers, "Date");
        const { fromAddress, fromDomain, senderName } = parseFromHeader(from);
        const receivedAt = parseReceivedAt(date);

        const fullMessage = await getMessageFull(accessToken, message.id);
        const body = extractBodyText(fullMessage.payload);
        const emailText = buildEmailText({
          from,
          subject,
          date,
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
            provider: "gmail",
            accountKey: args.accountKey,
            integrationId: integration.id,
            syncRunId: syncRun.id,
            externalMessageId: metadata.id,
            externalThreadId: metadata.threadId,
            fromAddress,
            fromDomain,
            senderName,
            subject,
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
            jobId: savedMessage.matchedJobId,
            stageTarget: savedMessage.stageTarget ?? "no_change",
            receivedAt: savedMessage.receivedAt,
            note: "Auto-created from Smart Router.",
          });
        }
      } catch (error) {
        errored += 1;
        logger.warn("Failed to ingest Gmail message", {
          provider: "gmail",
          accountKey: args.accountKey,
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
      provider: "gmail",
      accountKey: args.accountKey,
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
      errorCode: "GMAIL_SYNC_FAILED",
      errorMessage,
    });
    await updatePostApplicationIntegrationSyncState({
      provider: "gmail",
      accountKey: args.accountKey,
      lastSyncedAt: Date.now(),
      lastError: errorMessage,
      status: "error",
    });

    throw error;
  }
}

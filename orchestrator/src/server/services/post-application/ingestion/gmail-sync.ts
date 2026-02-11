import { requestTimeout } from "@infra/errors";
import { logger } from "@infra/logger";
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
import {
  type JsonSchemaDefinition,
  LlmService,
} from "@server/services/llm-service";
import { runJobMappingForMessage } from "../mapping/engine";
import {
  classifyByKeywords,
  computeKeywordRelevanceScore,
  computePolicyDecision,
  POST_APPLICATION_RELEVANCE_MIN_THRESHOLD,
} from "./relevance";

const DEFAULT_SEARCH_DAYS = 90;
const DEFAULT_MAX_MESSAGES = 100;
const GMAIL_HTTP_TIMEOUT_MS = 15_000;

const LLM_CLASSIFICATION_SCHEMA: JsonSchemaDefinition = {
  name: "post_application_email_classification",
  schema: {
    type: "object",
    properties: {
      relevanceScore: {
        type: "integer",
        description:
          "Relevance score between 0-100 for job application tracking relevance.",
      },
      classificationLabel: {
        type: "string",
        description: "Best matching job application label.",
      },
      confidence: {
        type: "number",
        description: "Model confidence from 0 to 1.",
      },
      companyName: {
        type: "string",
        description: "Company name if present.",
      },
      jobTitle: {
        type: "string",
        description: "Job title if present.",
      },
      reason: {
        type: "string",
        description: "One sentence reason for the classification.",
      },
    },
    required: ["relevanceScore", "classificationLabel", "confidence", "reason"],
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

type LlmClassificationResult = {
  relevanceScore: number;
  classificationLabel: string;
  confidence: number;
  companyName?: string;
  jobTitle?: string;
  reason: string;
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

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBodyText(payload: GmailFullMessage["payload"]): string {
  if (!payload) return "";
  const chunks: string[] = [];

  const walk = (part: NonNullable<GmailFullMessage["payload"]>): void => {
    const mimeType = String(part.mimeType ?? "").toLowerCase();
    const data = part.body?.data;
    if (data) {
      const decoded = decodeBase64Url(data);
      if (mimeType.includes("text/html")) {
        chunks.push(htmlToText(decoded));
      } else if (mimeType.startsWith("text/")) {
        chunks.push(decoded);
      }
    }

    for (const child of part.parts ?? []) {
      walk(child as NonNullable<GmailFullMessage["payload"]>);
    }
  };

  walk(payload);
  return chunks.filter(Boolean).join("\n\n").trim();
}

function buildEmailText(input: {
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
}): string {
  return `From: ${input.from}
Subject: ${input.subject}
Date: ${input.date}
Snippet: ${input.snippet}
Body:
${input.body}`.trim();
}

async function classifyWithLlm(
  emailText: string,
): Promise<LlmClassificationResult> {
  const overrideModel = await getSetting("model");
  const model =
    overrideModel || process.env.MODEL || "google/gemini-3-flash-preview";

  const llm = new LlmService();
  const result = await llm.callJson<LlmClassificationResult>({
    model,
    messages: [
      {
        role: "system",
        content:
          "You classify post-application emails. Return concise, factual JSON.",
      },
      {
        role: "user",
        content: `Classify the email for post-application tracking.
- Return relevanceScore (0-100).
- Return classificationLabel using one of:
Application confirmation, Rejection, Availability request, Information request, Assessment sent, Interview invitation, Referral - Action required, Did not apply - inbound request, Action required from company, Hiring freeze notification, Withdrew application, Offer made, False positive.
- Return confidence between 0 and 1.
- Return reason in one sentence.
- Optionally return companyName and jobTitle.

Email:
${emailText.slice(0, 12000)}`,
      },
    ],
    jsonSchema: LLM_CLASSIFICATION_SCHEMA,
    maxRetries: 1,
    retryDelayMs: 400,
  });

  if (!result.success) {
    throw new Error(`LLM classification failed: ${result.error}`);
  }

  const relevanceScore = Math.max(
    0,
    Math.min(100, Math.round(result.data.relevanceScore)),
  );
  const confidence =
    typeof result.data.confidence === "number" &&
    Number.isFinite(result.data.confidence)
      ? Math.max(0, Math.min(1, result.data.confidence))
      : 0;

  return {
    relevanceScore,
    classificationLabel: String(result.data.classificationLabel ?? "").trim(),
    confidence,
    companyName: asString(result.data.companyName) ?? undefined,
    jobTitle: asString(result.data.jobTitle) ?? undefined,
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
      resolvedCredentials.accessToken,
      searchDays,
      maxMessages,
    );

    for (const message of messageIds) {
      discovered += 1;

      try {
        const metadata = await getMessageMetadata(
          resolvedCredentials.accessToken,
          message.id,
        );
        const from = headerValue(metadata.headers, "From");
        const subject = headerValue(metadata.headers, "Subject");
        const date = headerValue(metadata.headers, "Date");
        const { fromAddress, fromDomain, senderName } = parseFromHeader(from);
        const receivedAt = parseReceivedAt(date);

        const keywordScore = computeKeywordRelevanceScore({
          from,
          subject,
          snippet: metadata.snippet,
        });
        const policyDecision = computePolicyDecision(keywordScore);

        if (!policyDecision.shouldUseLlm && !policyDecision.isRelevant) {
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
            relevanceKeywordScore: keywordScore,
            relevanceLlmScore: null,
            relevanceFinalScore: keywordScore,
            relevanceDecision: "not_relevant",
            reviewStatus: "not_relevant",
          });
          continue;
        }

        if (!policyDecision.shouldUseLlm && policyDecision.isRelevant) {
          const classificationLabel = classifyByKeywords({
            subject,
            snippet: metadata.snippet,
          });

          const savedMessage = await upsertPostApplicationMessage({
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
            classificationLabel,
            classificationConfidence: 0.95,
            classificationPayload: {
              method: "keyword",
            },
            relevanceKeywordScore: keywordScore,
            relevanceLlmScore: null,
            relevanceFinalScore: keywordScore,
            relevanceDecision: "relevant",
            reviewStatus: "pending_review",
          });
          const mapping = await runJobMappingForMessage({
            message: savedMessage,
          });
          if (mapping.matchedJobId) {
            matched += 1;
          }
          relevant += 1;
          classified += 1;
          continue;
        }

        const fullMessage = await getMessageFull(
          resolvedCredentials.accessToken,
          message.id,
        );
        const body = extractBodyText(fullMessage.payload);
        const emailText = buildEmailText({
          from,
          subject,
          date,
          snippet: metadata.snippet,
          body,
        });
        const llmResult = await classifyWithLlm(emailText);
        const finalScore = llmResult.relevanceScore;
        const isRelevant =
          finalScore >= POST_APPLICATION_RELEVANCE_MIN_THRESHOLD &&
          llmResult.classificationLabel.toLowerCase() !== "false positive";

        const savedMessage = await upsertPostApplicationMessage({
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
          classificationLabel: llmResult.classificationLabel,
          classificationConfidence: llmResult.confidence,
          classificationPayload: {
            method: "llm",
            reason: llmResult.reason,
            companyName: llmResult.companyName ?? null,
            jobTitle: llmResult.jobTitle ?? null,
          },
          relevanceKeywordScore: keywordScore,
          relevanceLlmScore: llmResult.relevanceScore,
          relevanceFinalScore: finalScore,
          relevanceDecision: isRelevant ? "relevant" : "not_relevant",
          reviewStatus: isRelevant ? "pending_review" : "not_relevant",
        });

        if (isRelevant) {
          const mapping = await runJobMappingForMessage({
            message: savedMessage,
          });
          if (mapping.matchedJobId) {
            matched += 1;
          }
          relevant += 1;
        }
        classified += 1;
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
    }

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

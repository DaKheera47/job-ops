import { requestTimeout } from "@infra/errors";
import { convert } from "html-to-text";

export const GMAIL_HTTP_TIMEOUT_MS = 15_000;

export type GmailCredentials = {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
  email?: string;
};

export type GmailListMessage = {
  id: string;
  threadId: string;
};

export type GmailHeader = { name?: string; value?: string };

export type GmailMetadataMessage = {
  id: string;
  threadId: string;
  snippet: string;
  headers: GmailHeader[];
};

export type GmailFullMessage = GmailMetadataMessage & {
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

export async function fetchWithTimeout(
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

export function buildGmailQuery(searchDays: number): string {
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

export async function listMessageIds(
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

export async function getMessageMetadata(
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

export async function getMessageFull(
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

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
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

export function extractBodyText(payload: GmailFullMessage["payload"]): string {
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

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

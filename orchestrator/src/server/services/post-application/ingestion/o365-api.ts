import { requestTimeout } from "@infra/errors";
import { normalizeWhitespace } from "@shared/utils/string";
import { convert } from "html-to-text";

export const O365_HTTP_TIMEOUT_MS = 15_000;
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

export type O365Credentials = {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
  email?: string;
};

export type O365ListMessage = {
  id: string;
  conversationId: string;
};

export type O365Message = {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  from: {
    emailAddress: {
      name?: string;
      address: string;
    };
  };
  receivedDateTime: string;
  body?: {
    contentType: string;
    content: string;
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
        `O365 request timed out after ${args.timeoutMs}ms for ${url}.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveO365OauthTenantId(): string {
  return asString(process.env.O365_OAUTH_TENANT_ID) ?? "common";
}

export async function resolveO365AccessToken(
  credentials: O365Credentials,
): Promise<O365Credentials> {
  const now = Date.now();
  if (
    credentials.accessToken &&
    credentials.expiryDate &&
    credentials.expiryDate > now + 60_000
  ) {
    return credentials;
  }

  const clientId = asString(process.env.O365_OAUTH_CLIENT_ID);
  const clientSecret = asString(process.env.O365_OAUTH_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing O365_OAUTH_CLIENT_ID or O365_OAUTH_CLIENT_SECRET for O365 token refresh.",
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken,
  });

  const response = await fetchWithTimeout(
    `https://login.microsoftonline.com/${resolveO365OauthTenantId()}/oauth2/v2.0/token`,
    {
      timeoutMs: O365_HTTP_TIMEOUT_MS,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    },
  );
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`O365 token refresh failed with HTTP ${response.status}.`);
  }

  const accessToken = asString(data?.access_token);
  const expiresIn =
    typeof data?.expires_in === "number" && Number.isFinite(data.expires_in)
      ? data.expires_in
      : 3600;
  if (!accessToken) {
    throw new Error(
      "O365 token refresh response did not include access_token.",
    );
  }

  // Microsoft may rotate the refresh token on each use. Prefer the new one
  // when present so subsequent refreshes don't fail with invalid_grant.
  const rotatedRefreshToken = asString(data?.refresh_token);

  return {
    ...credentials,
    ...(rotatedRefreshToken ? { refreshToken: rotatedRefreshToken } : {}),
    accessToken,
    expiryDate: Date.now() + expiresIn * 1000,
  };
}

export async function graphApi<T>(token: string, url: string): Promise<T> {
  const response = await fetchWithTimeout(url, {
    timeoutMs: O365_HTTP_TIMEOUT_MS,
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
    throw new Error(`Microsoft Graph API request failed (${response.status}).`);
  }
  return data as T;
}

export function buildO365Filter(searchDays: number): string {
  const since = new Date(
    Date.now() - searchDays * 24 * 60 * 60 * 1000,
  ).toISOString();

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

  const subjectFilter = subjectTerms
    .map((term) => `contains(subject,'${term.replace(/'/g, "''")}')`)
    .join(" or ");

  return `receivedDateTime ge ${since} and (${subjectFilter})`;
}

export async function listMessageIds(
  token: string,
  searchDays: number,
  maxMessages: number,
): Promise<O365ListMessage[]> {
  const messages: O365ListMessage[] = [];
  const filter = encodeURIComponent(buildO365Filter(searchDays));
  const top = Math.min(50, maxMessages);

  let url: string | null =
    `${GRAPH_API_BASE}/me/messages?$filter=${filter}&$select=id,conversationId&$top=${top}&$orderby=receivedDateTime desc`;

  while (url && messages.length < maxMessages) {
    const page: {
      value?: Array<{ id?: string; conversationId?: string }>;
      "@odata.nextLink"?: string;
    } = await graphApi(token, url);

    for (const message of page.value ?? []) {
      if (!message.id) continue;
      messages.push({
        id: message.id,
        conversationId: message.conversationId ?? "",
      });
      if (messages.length >= maxMessages) {
        return messages;
      }
    }
    url = page["@odata.nextLink"] ?? null;
  }

  return messages;
}

export async function getMessageMetadata(
  token: string,
  messageId: string,
): Promise<O365Message> {
  const message = await graphApi<{
    id?: string;
    conversationId?: string;
    subject?: string;
    bodyPreview?: string;
    from?: O365Message["from"];
    receivedDateTime?: string;
  }>(
    token,
    `${GRAPH_API_BASE}/me/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,subject,bodyPreview,from,receivedDateTime`,
  );

  return {
    id: message.id ?? messageId,
    conversationId: message.conversationId ?? "",
    subject: message.subject ?? "",
    bodyPreview: message.bodyPreview ?? "",
    from: message.from ?? { emailAddress: { address: "" } },
    receivedDateTime: message.receivedDateTime ?? "",
  };
}

export async function getMessageFull(
  token: string,
  messageId: string,
): Promise<O365Message> {
  const message = await graphApi<{
    id?: string;
    conversationId?: string;
    subject?: string;
    bodyPreview?: string;
    from?: O365Message["from"];
    receivedDateTime?: string;
    body?: { contentType?: string; content?: string };
  }>(
    token,
    `${GRAPH_API_BASE}/me/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,subject,bodyPreview,from,receivedDateTime,body`,
  );

  return {
    id: message.id ?? messageId,
    conversationId: message.conversationId ?? "",
    subject: message.subject ?? "",
    bodyPreview: message.bodyPreview ?? "",
    from: message.from ?? { emailAddress: { address: "" } },
    receivedDateTime: message.receivedDateTime ?? "",
    body: message.body
      ? {
          contentType: message.body.contentType ?? "text",
          content: message.body.content ?? "",
        }
      : undefined,
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

export function extractBodyText(message: O365Message): string {
  if (!message.body?.content) return message.bodyPreview ?? "";

  const contentType = (message.body.contentType ?? "").toLowerCase();
  if (contentType === "html") {
    return normalizeWhitespace(
      cleanEmailHtmlForLlm(message.body.content),
    ).trim();
  }

  return normalizeWhitespace(message.body.content).trim();
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

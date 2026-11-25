import { upsertConnectedPostApplicationIntegration } from "@server/repositories/post-application-integrations";
import type { GmailCredentials, GmailHeader } from "./gmail-api";
import {
  extractBodyText,
  getMessageFull,
  getMessageMetadata,
  listMessageIds,
  resolveGmailAccessToken,
} from "./gmail-api";
import {
  buildEmailText,
  DEFAULT_MAX_MESSAGES,
  DEFAULT_SEARCH_DAYS,
  type IngestionSyncSummary,
  type IngestionTransport,
  loadConnectedIntegration,
  runIngestionSync,
} from "./ingestion-core";

export type GmailSyncSummary = IngestionSyncSummary;

export const __test__ = {
  extractBodyText,
  buildEmailText,
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function headerValue(headers: GmailHeader[], name: string): string {
  const found = headers.find(
    (header) => (header.name ?? "").toLowerCase() === name.toLowerCase(),
  );
  return String(found?.value ?? "");
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

function buildGmailTransport(accessToken: string): IngestionTransport {
  return {
    listMessages: (searchDays, maxMessages) =>
      listMessageIds(accessToken, searchDays, maxMessages),
    getMetadata: async (id) => {
      const metadata = await getMessageMetadata(accessToken, id);
      return {
        id: metadata.id,
        threadId: metadata.threadId,
        snippet: metadata.snippet,
        from: headerValue(metadata.headers, "From"),
        subject: headerValue(metadata.headers, "Subject"),
        date: headerValue(metadata.headers, "Date"),
      };
    },
    getBody: async (id) => {
      const full = await getMessageFull(accessToken, id);
      return extractBodyText(full.payload);
    },
  };
}

export async function runGmailIngestionSync(args: {
  accountKey: string;
  maxMessages?: number;
  searchDays?: number;
}): Promise<GmailSyncSummary> {
  const integration = await loadConnectedIntegration("gmail", args.accountKey);
  const parsedCredentials = parseGmailCredentials(
    integration.credentials ?? null,
  );
  if (!parsedCredentials) {
    throw new Error(`Gmail account '${args.accountKey}' is not connected.`);
  }

  const resolvedCredentials = await resolveGmailAccessToken(parsedCredentials);
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

  return runIngestionSync({
    provider: "gmail",
    accountKey: args.accountKey,
    integration,
    transport: buildGmailTransport(resolvedCredentials.accessToken),
    maxMessages: args.maxMessages ?? DEFAULT_MAX_MESSAGES,
    searchDays: args.searchDays ?? DEFAULT_SEARCH_DAYS,
  });
}

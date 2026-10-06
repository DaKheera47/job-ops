import { buildImapTransport, type ImapCredentials } from "./imap-api";
import {
  DEFAULT_MAX_MESSAGES,
  DEFAULT_SEARCH_DAYS,
  type IngestionSyncSummary,
  loadConnectedIntegration,
  runIngestionSync,
} from "./ingestion-core";

export type ImapSyncSummary = IngestionSyncSummary;

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseImapCredentials(
  credentials: Record<string, unknown> | null,
): ImapCredentials | null {
  if (!credentials) return null;
  const host = asString(credentials.host);
  const user = asString(credentials.user);
  const pass = asString(credentials.pass);
  if (!host || !user || !pass) return null;

  const port =
    typeof credentials.port === "number" && Number.isFinite(credentials.port)
      ? credentials.port
      : 993;

  return {
    host,
    port,
    secure: credentials.secure !== false,
    user,
    pass,
    mailbox: asString(credentials.mailbox) ?? undefined,
  };
}

export async function runImapIngestionSync(args: {
  accountKey: string;
  maxMessages?: number;
  searchDays?: number;
}): Promise<ImapSyncSummary> {
  const integration = await loadConnectedIntegration("imap", args.accountKey);
  const credentials = parseImapCredentials(integration.credentials ?? null);
  if (!credentials) {
    throw new Error(`IMAP account '${args.accountKey}' is not connected.`);
  }

  return runIngestionSync({
    provider: "imap",
    accountKey: args.accountKey,
    integration,
    transport: buildImapTransport(credentials),
    maxMessages: args.maxMessages ?? DEFAULT_MAX_MESSAGES,
    searchDays: args.searchDays ?? DEFAULT_SEARCH_DAYS,
  });
}

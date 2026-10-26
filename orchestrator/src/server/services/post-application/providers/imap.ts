import { logger } from "@infra/logger";
import {
  disconnectPostApplicationIntegration,
  getPostApplicationIntegration,
  upsertConnectedPostApplicationIntegration,
} from "@server/repositories/post-application-integrations";
import { runImapIngestionSync } from "@server/services/post-application/ingestion/imap-sync";
import type { PostApplicationIntegration } from "@shared/types";
import { providerInvalidRequest } from "./errors";
import type {
  PostApplicationProviderActionResult,
  PostApplicationProviderAdapter,
  PostApplicationProviderConnectArgs,
  PostApplicationProviderDisconnectArgs,
  PostApplicationProviderStatusArgs,
  PostApplicationProviderSyncArgs,
} from "./types";

type ImapCredentialPayload = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox?: string;
  displayName?: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseImapConnectPayload(
  args: PostApplicationProviderConnectArgs,
): ImapCredentialPayload {
  const raw = args.payload?.payload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw providerInvalidRequest(
      "IMAP connect requires payload credentials in body.payload.",
    );
  }
  const record = raw as Record<string, unknown>;

  const host = asString(record.host);
  const user = asString(record.user);
  const pass = asString(record.pass);
  if (!host || !user || !pass) {
    throw providerInvalidRequest(
      "IMAP connect requires host, user and pass in body.payload.",
    );
  }

  return {
    host,
    port: asNumber(record.port) ?? 993,
    secure: record.secure !== false,
    user,
    pass,
    mailbox: asString(record.mailbox),
    displayName: asString(record.displayName),
  };
}

// Never return the password or any secret in status responses.
function toPublicIntegration(
  integration: PostApplicationIntegration | null,
): PostApplicationIntegration | null {
  if (!integration) return null;

  const credentials = integration.credentials ?? {};
  return {
    ...integration,
    credentials: {
      host: asString(credentials.host) ?? null,
      port: asNumber(credentials.port) ?? null,
      secure: credentials.secure !== false,
      user: asString(credentials.user) ?? null,
      mailbox: asString(credentials.mailbox) ?? null,
      hasPassword:
        typeof credentials.pass === "string" && credentials.pass.length > 0,
    },
  };
}

function buildStatus(
  accountKey: string,
  integration: PostApplicationIntegration | null,
  message?: string,
): PostApplicationProviderActionResult {
  const publicIntegration = toPublicIntegration(integration);
  const hasPassword = Boolean(publicIntegration?.credentials?.hasPassword);

  return {
    status: {
      provider: "imap",
      accountKey,
      connected: publicIntegration?.status === "connected" && hasPassword,
      integration: publicIntegration,
    },
    message,
  };
}

export const imapProvider: PostApplicationProviderAdapter = {
  key: "imap",

  async connect(
    args: PostApplicationProviderConnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const credentials = parseImapConnectPayload(args);
    const displayName = credentials.displayName ?? `${credentials.user} (IMAP)`;

    const integration = await upsertConnectedPostApplicationIntegration({
      provider: "imap",
      accountKey: args.accountKey,
      displayName,
      credentials: {
        host: credentials.host,
        port: credentials.port,
        secure: credentials.secure,
        user: credentials.user,
        pass: credentials.pass,
        ...(credentials.mailbox ? { mailbox: credentials.mailbox } : {}),
      },
    });

    logger.info("IMAP integration connected", {
      provider: "imap",
      accountKey: args.accountKey,
      initiatedBy: args.initiatedBy ?? null,
      integrationId: integration.id,
    });

    return buildStatus(
      args.accountKey,
      integration,
      "IMAP integration connected.",
    );
  },

  async status(
    args: PostApplicationProviderStatusArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const integration = await getPostApplicationIntegration(
      "imap",
      args.accountKey,
    );
    if (!integration) {
      return buildStatus(
        args.accountKey,
        null,
        "IMAP provider is not connected.",
      );
    }

    return buildStatus(args.accountKey, integration);
  },

  async sync(
    args: PostApplicationProviderSyncArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const integration = await getPostApplicationIntegration(
      "imap",
      args.accountKey,
    );
    if (!integration) {
      throw providerInvalidRequest(
        `IMAP account '${args.accountKey}' is not connected.`,
      );
    }

    const summary = await runImapIngestionSync({
      accountKey: args.accountKey,
      maxMessages: args.payload?.maxMessages,
      searchDays: args.payload?.searchDays,
    });

    const refreshedIntegration = await getPostApplicationIntegration(
      "imap",
      args.accountKey,
    );
    logger.info("IMAP sync completed", {
      provider: "imap",
      accountKey: args.accountKey,
      initiatedBy: args.initiatedBy ?? null,
      integrationId: integration.id,
      discovered: summary.discovered,
      relevant: summary.relevant,
      classified: summary.classified,
      errored: summary.errored,
    });

    return buildStatus(
      args.accountKey,
      refreshedIntegration,
      `Sync complete: discovered=${summary.discovered}, relevant=${summary.relevant}, classified=${summary.classified}, errored=${summary.errored}.`,
    );
  },

  async disconnect(
    args: PostApplicationProviderDisconnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const disconnected = await disconnectPostApplicationIntegration(
      "imap",
      args.accountKey,
    );
    logger.info("IMAP integration disconnected", {
      provider: "imap",
      accountKey: args.accountKey,
      initiatedBy: args.initiatedBy ?? null,
      integrationId: disconnected?.id ?? null,
    });

    return buildStatus(
      args.accountKey,
      disconnected,
      "IMAP integration disconnected.",
    );
  },
};

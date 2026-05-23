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
  port?: number;
  user: string;
  password: string;
  tls?: boolean;
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

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseImapCredentials(
  args: PostApplicationProviderConnectArgs,
): ImapCredentialPayload {
  const raw = args.payload?.payload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw providerInvalidRequest(
      "IMAP connect requires payload credentials in body.payload.",
    );
  }

  const host = asString((raw as Record<string, unknown>).host);
  const user = asString((raw as Record<string, unknown>).user);
  const password = asString((raw as Record<string, unknown>).password);

  if (!host) {
    throw providerInvalidRequest(
      "IMAP connect requires a non-empty host in body.payload.host.",
    );
  }

  if (!user) {
    throw providerInvalidRequest(
      "IMAP connect requires a non-empty user in body.payload.user.",
    );
  }

  if (!password) {
    throw providerInvalidRequest(
      "IMAP connect requires a non-empty password in body.payload.password.",
    );
  }

  return {
    host,
    user,
    password,
    port: asNumber((raw as Record<string, unknown>).port),
    tls: asBoolean((raw as Record<string, unknown>).tls),
    displayName: asString((raw as Record<string, unknown>).displayName),
  };
}

function toPublicIntegration(
  integration: PostApplicationIntegration | null,
): PostApplicationIntegration | null {
  if (!integration) return null;

  const credentials = integration.credentials ?? {};
  return {
    ...integration,
    credentials: {
      host: asString(credentials.host) ?? null,
      port: asNumber(credentials.port) ?? 993,
      user: asString(credentials.user) ?? null,
      hasPassword:
        typeof credentials.password === "string" &&
        credentials.password.length > 0,
      tls: asBoolean(credentials.tls) ?? true,
    },
  };
}

function buildStatus(
  accountKey: string,
  integration: PostApplicationIntegration | null,
  message?: string,
): PostApplicationProviderActionResult {
  const publicIntegration = toPublicIntegration(integration);
  const hasPassword = Boolean(
    publicIntegration?.credentials?.hasPassword,
  );

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
    const credentials = parseImapCredentials(args);
    const displayName =
      credentials.displayName ??
      `IMAP (${credentials.user}@${credentials.host})`;

    const integration = await upsertConnectedPostApplicationIntegration({
      provider: "imap",
      accountKey: args.accountKey,
      displayName,
      credentials: {
        host: credentials.host,
        port: credentials.port ?? 993,
        user: credentials.user,
        password: credentials.password,
        tls: credentials.tls !== false,
      },
    });

    logger.info("IMAP integration connected", {
      provider: "imap",
      accountKey: args.accountKey,
      initiatedBy: args.initiatedBy ?? null,
      integrationId: integration.id,
      host: credentials.host,
      port: credentials.port ?? 993,
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
    const integration = await getPostApplicationIntegration(
      "imap",
      args.accountKey,
    );

    const disconnected = await disconnectPostApplicationIntegration(
      "imap",
      args.accountKey,
    );
    logger.info("IMAP integration disconnected", {
      provider: "imap",
      accountKey: args.accountKey,
      initiatedBy: args.initiatedBy ?? null,
      integrationId: disconnected?.id ?? integration?.id ?? null,
    });

    return buildStatus(
      args.accountKey,
      disconnected,
      "IMAP integration disconnected.",
    );
  },
};

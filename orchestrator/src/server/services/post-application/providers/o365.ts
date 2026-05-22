import { logger } from "@infra/logger";
import {
  disconnectPostApplicationIntegration,
  getPostApplicationIntegration,
  upsertConnectedPostApplicationIntegration,
} from "@server/repositories/post-application-integrations";
import { runO365IngestionSync } from "@server/services/post-application/ingestion/o365-sync";
import type { PostApplicationIntegration } from "@shared/types";
import { providerInvalidRequest, providerUpstreamError } from "./errors";
import type {
  PostApplicationProviderActionResult,
  PostApplicationProviderAdapter,
  PostApplicationProviderConnectArgs,
  PostApplicationProviderDisconnectArgs,
  PostApplicationProviderStatusArgs,
  PostApplicationProviderSyncArgs,
} from "./types";

type O365CredentialPayload = {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
  email?: string;
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

function parseO365Credentials(
  args: PostApplicationProviderConnectArgs,
): O365CredentialPayload {
  const raw = args.payload?.payload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw providerInvalidRequest(
      "O365 connect requires payload credentials in body.payload.",
    );
  }

  const refreshToken = asString((raw as Record<string, unknown>).refreshToken);
  if (!refreshToken) {
    throw providerInvalidRequest(
      "O365 connect requires a non-empty refreshToken in body.payload.refreshToken.",
    );
  }

  return {
    refreshToken,
    accessToken: asString((raw as Record<string, unknown>).accessToken),
    expiryDate: asNumber((raw as Record<string, unknown>).expiryDate),
    scope: asString((raw as Record<string, unknown>).scope),
    tokenType: asString((raw as Record<string, unknown>).tokenType),
    email: asString((raw as Record<string, unknown>).email),
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
      hasRefreshToken:
        typeof credentials.refreshToken === "string" &&
        credentials.refreshToken.length > 0,
      hasAccessToken:
        typeof credentials.accessToken === "string" &&
        credentials.accessToken.length > 0,
      scope: asString(credentials.scope) ?? null,
      tokenType: asString(credentials.tokenType) ?? null,
      expiryDate: asNumber(credentials.expiryDate) ?? null,
      email: asString(credentials.email) ?? null,
    },
  };
}

function buildStatus(
  accountKey: string,
  integration: PostApplicationIntegration | null,
  message?: string,
): PostApplicationProviderActionResult {
  const publicIntegration = toPublicIntegration(integration);
  const hasRefreshToken = Boolean(
    publicIntegration?.credentials?.hasRefreshToken,
  );

  return {
    status: {
      provider: "o365",
      accountKey,
      connected: publicIntegration?.status === "connected" && hasRefreshToken,
      integration: publicIntegration,
    },
    message,
  };
}

export const o365Provider: PostApplicationProviderAdapter = {
  key: "o365",
  async connect(
    args: PostApplicationProviderConnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const credentials = parseO365Credentials(args);
    const displayName =
      credentials.displayName ??
      credentials.email ??
      `O365 (${args.accountKey})`;

    const integration = await upsertConnectedPostApplicationIntegration({
      provider: "o365",
      accountKey: args.accountKey,
      displayName,
      credentials: {
        refreshToken: credentials.refreshToken,
        ...(credentials.accessToken
          ? { accessToken: credentials.accessToken }
          : {}),
        ...(typeof credentials.expiryDate === "number"
          ? { expiryDate: credentials.expiryDate }
          : {}),
        ...(credentials.scope ? { scope: credentials.scope } : {}),
        ...(credentials.tokenType ? { tokenType: credentials.tokenType } : {}),
        ...(credentials.email ? { email: credentials.email } : {}),
      },
    });

    logger.info("O365 integration connected", {
      provider: "o365",
      accountKey: args.accountKey,
      initiatedBy: args.initiatedBy ?? null,
      integrationId: integration.id,
    });

    return buildStatus(
      args.accountKey,
      integration,
      "O365 integration connected.",
    );
  },

  async status(
    args: PostApplicationProviderStatusArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const integration = await getPostApplicationIntegration(
      "o365",
      args.accountKey,
    );
    if (!integration) {
      return buildStatus(
        args.accountKey,
        null,
        "O365 provider is not connected.",
      );
    }

    return buildStatus(args.accountKey, integration);
  },

  async sync(
    args: PostApplicationProviderSyncArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const integration = await getPostApplicationIntegration(
      "o365",
      args.accountKey,
    );
    if (!integration) {
      throw providerInvalidRequest(
        `O365 account '${args.accountKey}' is not connected.`,
      );
    }

    const summary = await runO365IngestionSync({
      accountKey: args.accountKey,
      maxMessages: args.payload?.maxMessages,
      searchDays: args.payload?.searchDays,
    });

    const refreshedIntegration = await getPostApplicationIntegration(
      "o365",
      args.accountKey,
    );
    logger.info("O365 sync completed", {
      provider: "o365",
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
      "o365",
      args.accountKey,
    );
    const integration = disconnected
      ? disconnected
      : await getPostApplicationIntegration("o365", args.accountKey);

    logger.info("O365 integration disconnected", {
      provider: "o365",
      accountKey: args.accountKey,
      initiatedBy: args.initiatedBy ?? null,
      integrationId: disconnected?.id ?? integration?.id ?? null,
    });

    return buildStatus(
      args.accountKey,
      disconnected,
      "O365 integration disconnected.",
    );
  },
};

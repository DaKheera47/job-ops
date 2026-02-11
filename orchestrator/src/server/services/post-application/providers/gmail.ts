import { logger } from "@infra/logger";
import {
  disconnectPostApplicationIntegration,
  getPostApplicationIntegration,
  upsertConnectedPostApplicationIntegration,
} from "@server/repositories/post-application-integrations";
import { runGmailIngestionSync } from "@server/services/post-application/ingestion/gmail-sync";
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

type GmailCredentialPayload = {
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

function parseGmailCredentials(
  args: PostApplicationProviderConnectArgs,
): GmailCredentialPayload {
  const raw = args.payload?.payload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw providerInvalidRequest(
      "Gmail connect requires payload credentials in body.payload.",
    );
  }

  const refreshToken = asString((raw as Record<string, unknown>).refreshToken);
  if (!refreshToken) {
    throw providerInvalidRequest(
      "Gmail connect requires a non-empty refreshToken in body.payload.refreshToken.",
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
      provider: "gmail",
      accountKey,
      connected: publicIntegration?.status === "connected" && hasRefreshToken,
      integration: publicIntegration,
    },
    message,
  };
}

async function revokeGoogleToken(token: string): Promise<void> {
  const timeoutMs = 5_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = new URLSearchParams({ token });
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw providerUpstreamError(
        `Google token revoke failed with HTTP ${response.status}.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw providerUpstreamError("Google token revoke request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const gmailProvider: PostApplicationProviderAdapter = {
  key: "gmail",
  async connect(
    args: PostApplicationProviderConnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const credentials = parseGmailCredentials(args);
    const displayName =
      credentials.displayName ??
      credentials.email ??
      `Gmail (${args.accountKey})`;

    const integration = await upsertConnectedPostApplicationIntegration({
      provider: "gmail",
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

    logger.info("Gmail integration connected", {
      provider: "gmail",
      accountKey: args.accountKey,
      initiatedBy: args.initiatedBy ?? null,
      integrationId: integration.id,
    });

    return buildStatus(
      args.accountKey,
      integration,
      "Gmail integration connected.",
    );
  },

  async status(
    args: PostApplicationProviderStatusArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const integration = await getPostApplicationIntegration(
      "gmail",
      args.accountKey,
    );
    if (!integration) {
      return buildStatus(
        args.accountKey,
        null,
        "Gmail provider is not connected.",
      );
    }

    return buildStatus(args.accountKey, integration);
  },

  async sync(
    args: PostApplicationProviderSyncArgs,
  ): Promise<PostApplicationProviderActionResult> {
    const integration = await getPostApplicationIntegration(
      "gmail",
      args.accountKey,
    );
    if (!integration) {
      throw providerInvalidRequest(
        `Gmail account '${args.accountKey}' is not connected.`,
      );
    }

    const summary = await runGmailIngestionSync({
      accountKey: args.accountKey,
      maxMessages: args.payload?.maxMessages,
      searchDays: args.payload?.searchDays,
    });

    const refreshedIntegration = await getPostApplicationIntegration(
      "gmail",
      args.accountKey,
    );
    logger.info("Gmail sync completed", {
      provider: "gmail",
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
      "gmail",
      args.accountKey,
    );
    const refreshToken =
      integration?.credentials &&
      typeof integration.credentials.refreshToken === "string" &&
      integration.credentials.refreshToken.length > 0
        ? integration.credentials.refreshToken
        : null;

    let revokeWarning: string | null = null;
    if (refreshToken) {
      try {
        await revokeGoogleToken(refreshToken);
      } catch (error) {
        revokeWarning =
          error instanceof Error
            ? error.message
            : "Google token revoke failed before disconnect.";
        logger.warn("Gmail token revoke failed during disconnect", {
          provider: "gmail",
          accountKey: args.accountKey,
          initiatedBy: args.initiatedBy ?? null,
          revokeWarning,
        });
      }
    }

    const disconnected = await disconnectPostApplicationIntegration(
      "gmail",
      args.accountKey,
    );
    logger.info("Gmail integration disconnected", {
      provider: "gmail",
      accountKey: args.accountKey,
      initiatedBy: args.initiatedBy ?? null,
      integrationId: disconnected?.id ?? integration?.id ?? null,
      tokenRevoked: Boolean(refreshToken && !revokeWarning),
    });

    return buildStatus(
      args.accountKey,
      disconnected,
      revokeWarning
        ? "Gmail disconnected locally. Token revoke should be retried."
        : "Gmail integration disconnected.",
    );
  },
};

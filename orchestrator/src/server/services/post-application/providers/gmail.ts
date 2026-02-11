import { providerNotImplemented } from "./errors";
import type {
  PostApplicationProviderActionResult,
  PostApplicationProviderAdapter,
  PostApplicationProviderConnectArgs,
  PostApplicationProviderDisconnectArgs,
  PostApplicationProviderStatusArgs,
  PostApplicationProviderSyncArgs,
} from "./types";

function buildDisconnectedStatus(
  accountKey: string,
): PostApplicationProviderActionResult {
  return {
    status: {
      provider: "gmail",
      accountKey,
      connected: false,
      integration: null,
    },
    message: "Gmail provider framework is installed but not connected.",
  };
}

export const gmailProvider: PostApplicationProviderAdapter = {
  key: "gmail",

  async connect(
    args: PostApplicationProviderConnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    throw providerNotImplemented(
      `Gmail connect is not implemented yet for account '${args.accountKey}'.`,
    );
  },

  async status(
    args: PostApplicationProviderStatusArgs,
  ): Promise<PostApplicationProviderActionResult> {
    return buildDisconnectedStatus(args.accountKey);
  },

  async sync(
    args: PostApplicationProviderSyncArgs,
  ): Promise<PostApplicationProviderActionResult> {
    throw providerNotImplemented(
      `Gmail sync is not implemented yet for account '${args.accountKey}'.`,
    );
  },

  async disconnect(
    args: PostApplicationProviderDisconnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    throw providerNotImplemented(
      `Gmail disconnect is not implemented yet for account '${args.accountKey}'.`,
    );
  },
};

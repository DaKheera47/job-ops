import { providerNotImplemented } from "./errors";
import type {
  PostApplicationProviderActionResult,
  PostApplicationProviderAdapter,
  PostApplicationProviderConnectArgs,
  PostApplicationProviderDisconnectArgs,
  PostApplicationProviderStatusArgs,
  PostApplicationProviderSyncArgs,
} from "./types";

function notImplemented(accountKey: string): never {
  throw providerNotImplemented(
    `IMAP provider is not implemented yet for account '${accountKey}'.`,
  );
}

export const imapProvider: PostApplicationProviderAdapter = {
  key: "imap",

  async connect(
    args: PostApplicationProviderConnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    return notImplemented(args.accountKey);
  },

  async status(
    args: PostApplicationProviderStatusArgs,
  ): Promise<PostApplicationProviderActionResult> {
    return notImplemented(args.accountKey);
  },

  async sync(
    args: PostApplicationProviderSyncArgs,
  ): Promise<PostApplicationProviderActionResult> {
    return notImplemented(args.accountKey);
  },

  async disconnect(
    args: PostApplicationProviderDisconnectArgs,
  ): Promise<PostApplicationProviderActionResult> {
    return notImplemented(args.accountKey);
  },
};

import type {
  PostApplicationProvider,
  PostApplicationProviderActionConnectRequest,
  PostApplicationProviderActionResponse,
  PostApplicationProviderActionSyncRequest,
  PostApplicationProviderStatus,
} from "@shared/types";

export type PostApplicationProviderConnectArgs = {
  accountKey: string;
  initiatedBy?: string | null;
  payload?: PostApplicationProviderActionConnectRequest;
};

export type PostApplicationProviderStatusArgs = {
  accountKey: string;
};

export type PostApplicationProviderSyncArgs = {
  accountKey: string;
  initiatedBy?: string | null;
  payload?: PostApplicationProviderActionSyncRequest;
};

export type PostApplicationProviderDisconnectArgs = {
  accountKey: string;
  initiatedBy?: string | null;
};

export type PostApplicationProviderActionResult = {
  status: PostApplicationProviderStatus;
  message?: string;
};

export interface PostApplicationProviderAdapter {
  readonly key: PostApplicationProvider;

  connect(
    args: PostApplicationProviderConnectArgs,
  ): Promise<PostApplicationProviderActionResult>;

  status(
    args: PostApplicationProviderStatusArgs,
  ): Promise<PostApplicationProviderActionResult>;

  sync(
    args: PostApplicationProviderSyncArgs,
  ): Promise<PostApplicationProviderActionResult>;

  disconnect(
    args: PostApplicationProviderDisconnectArgs,
  ): Promise<PostApplicationProviderActionResult>;
}

export type ExecutePostApplicationProviderActionInput = {
  provider: string;
  action: PostApplicationProviderActionResponse["action"];
  accountKey: string;
  initiatedBy?: string | null;
  connectPayload?: PostApplicationProviderActionConnectRequest;
  syncPayload?: PostApplicationProviderActionSyncRequest;
};

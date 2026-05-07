import type {
  ApplicationStage,
  PostApplicationAction,
  PostApplicationActionResponse,
  PostApplicationInboxItem,
  PostApplicationProvider,
  PostApplicationProviderActionResponse,
  PostApplicationRouterStageTarget,
  PostApplicationSyncRun,
} from "@shared/types";
import { fetchApi } from "./core";

export async function postApplicationProviderConnect(input: {
  provider?: PostApplicationProvider;
  accountKey?: string;
  payload?: Record<string, unknown>;
}): Promise<PostApplicationProviderActionResponse> {
  const provider = input.provider ?? "gmail";
  return fetchApi<PostApplicationProviderActionResponse>(
    `/post-application/providers/${provider}/actions/connect`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input.accountKey ? { accountKey: input.accountKey } : {}),
        ...(input.payload ? { payload: input.payload } : {}),
      }),
    },
  );
}

export async function postApplicationGmailOauthStart(input?: {
  accountKey?: string;
}): Promise<{
  provider: "gmail";
  accountKey: string;
  authorizationUrl: string;
  state: string;
}> {
  const params = new URLSearchParams();
  if (input?.accountKey) params.set("accountKey", input.accountKey);
  const query = params.toString();
  return fetchApi<{
    provider: "gmail";
    accountKey: string;
    authorizationUrl: string;
    state: string;
  }>(
    `/post-application/providers/gmail/oauth/start${query ? `?${query}` : ""}`,
  );
}

export async function postApplicationGmailOauthExchange(input: {
  accountKey?: string;
  state: string;
  code: string;
}): Promise<PostApplicationProviderActionResponse> {
  return fetchApi<PostApplicationProviderActionResponse>(
    "/post-application/providers/gmail/oauth/exchange",
    {
      method: "POST",
      body: JSON.stringify({
        ...(input.accountKey ? { accountKey: input.accountKey } : {}),
        state: input.state,
        code: input.code,
      }),
    },
  );
}

export async function postApplicationProviderStatus(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
}): Promise<PostApplicationProviderActionResponse> {
  const provider = input?.provider ?? "gmail";
  return fetchApi<PostApplicationProviderActionResponse>(
    `/post-application/providers/${provider}/actions/status`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input?.accountKey ? { accountKey: input.accountKey } : {}),
      }),
    },
  );
}

export async function postApplicationProviderSync(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
  maxMessages?: number;
  searchDays?: number;
}): Promise<PostApplicationProviderActionResponse> {
  const provider = input?.provider ?? "gmail";
  return fetchApi<PostApplicationProviderActionResponse>(
    `/post-application/providers/${provider}/actions/sync`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input?.accountKey ? { accountKey: input.accountKey } : {}),
        ...(typeof input?.maxMessages === "number"
          ? { maxMessages: input.maxMessages }
          : {}),
        ...(typeof input?.searchDays === "number"
          ? { searchDays: input.searchDays }
          : {}),
      }),
    },
  );
}

export async function postApplicationProviderDisconnect(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
}): Promise<PostApplicationProviderActionResponse> {
  const provider = input?.provider ?? "gmail";
  return fetchApi<PostApplicationProviderActionResponse>(
    `/post-application/providers/${provider}/actions/disconnect`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input?.accountKey ? { accountKey: input.accountKey } : {}),
      }),
    },
  );
}

export async function getPostApplicationInbox(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
  limit?: number;
}): Promise<{ items: PostApplicationInboxItem[]; total: number }> {
  const params = new URLSearchParams();
  params.set("provider", input?.provider ?? "gmail");
  params.set("accountKey", input?.accountKey ?? "default");
  if (typeof input?.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  return fetchApi<{ items: PostApplicationInboxItem[]; total: number }>(
    `/post-application/inbox?${query}`,
  );
}

export async function approvePostApplicationInboxItem(input: {
  messageId: string;
  provider?: PostApplicationProvider;
  accountKey?: string;
  jobId?: string;
  stageTarget?: PostApplicationRouterStageTarget;
  toStage?: ApplicationStage;
  note?: string;
  decidedBy?: string;
}): Promise<{
  message: PostApplicationInboxItem["message"];
  stageEventId: string | null;
}> {
  return fetchApi<{
    message: PostApplicationInboxItem["message"];
    stageEventId: string | null;
  }>(`/post-application/inbox/${encodeURIComponent(input.messageId)}/approve`, {
    method: "POST",
    body: JSON.stringify({
      provider: input.provider ?? "gmail",
      accountKey: input.accountKey ?? "default",
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.stageTarget ? { stageTarget: input.stageTarget } : {}),
      ...(input.toStage ? { toStage: input.toStage } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
    }),
  });
}

export async function denyPostApplicationInboxItem(input: {
  messageId: string;
  provider?: PostApplicationProvider;
  accountKey?: string;
  decidedBy?: string;
}): Promise<{
  message: PostApplicationInboxItem["message"];
}> {
  return fetchApi<{ message: PostApplicationInboxItem["message"] }>(
    `/post-application/inbox/${encodeURIComponent(input.messageId)}/deny`,
    {
      method: "POST",
      body: JSON.stringify({
        provider: input.provider ?? "gmail",
        accountKey: input.accountKey ?? "default",
        ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
      }),
    },
  );
}

export async function runPostApplicationInboxAction(input: {
  action: PostApplicationAction;
  provider?: PostApplicationProvider;
  accountKey?: string;
  decidedBy?: string;
}): Promise<PostApplicationActionResponse> {
  return fetchApi<PostApplicationActionResponse>(
    "/post-application/inbox/actions",
    {
      method: "POST",
      body: JSON.stringify({
        action: input.action,
        provider: input.provider ?? "gmail",
        accountKey: input.accountKey ?? "default",
        ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
      }),
    },
  );
}

export async function getPostApplicationRuns(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
  limit?: number;
}): Promise<{ runs: PostApplicationSyncRun[]; total: number }> {
  const params = new URLSearchParams();
  params.set("provider", input?.provider ?? "gmail");
  params.set("accountKey", input?.accountKey ?? "default");
  if (typeof input?.limit === "number") {
    params.set("limit", String(input.limit));
  }
  const query = params.toString();
  return fetchApi<{ runs: PostApplicationSyncRun[]; total: number }>(
    `/post-application/runs?${query}`,
  );
}

export async function getPostApplicationRunMessages(input: {
  runId: string;
  provider?: PostApplicationProvider;
  accountKey?: string;
  limit?: number;
}): Promise<{
  run: PostApplicationSyncRun;
  items: PostApplicationInboxItem[];
  total: number;
}> {
  const params = new URLSearchParams();
  params.set("provider", input.provider ?? "gmail");
  params.set("accountKey", input.accountKey ?? "default");
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  const query = params.toString();
  return fetchApi<{
    run: PostApplicationSyncRun;
    items: PostApplicationInboxItem[];
    total: number;
  }>(
    `/post-application/runs/${encodeURIComponent(input.runId)}/messages?${query}`,
  );
}

export const POST_APPLICATION_PROVIDERS = ["gmail", "imap"] as const;
export type PostApplicationProvider =
  (typeof POST_APPLICATION_PROVIDERS)[number];

export const POST_APPLICATION_PROVIDER_ACTIONS = [
  "connect",
  "status",
  "sync",
  "disconnect",
] as const;
export type PostApplicationProviderAction =
  (typeof POST_APPLICATION_PROVIDER_ACTIONS)[number];

export const POST_APPLICATION_INTEGRATION_STATUSES = [
  "disconnected",
  "connected",
  "error",
] as const;
export type PostApplicationIntegrationStatus =
  (typeof POST_APPLICATION_INTEGRATION_STATUSES)[number];

export const POST_APPLICATION_SYNC_RUN_STATUSES = [
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type PostApplicationSyncRunStatus =
  (typeof POST_APPLICATION_SYNC_RUN_STATUSES)[number];

export const POST_APPLICATION_RELEVANCE_DECISIONS = [
  "relevant",
  "not_relevant",
  "needs_llm",
] as const;
export type PostApplicationRelevanceDecision =
  (typeof POST_APPLICATION_RELEVANCE_DECISIONS)[number];

export const POST_APPLICATION_MESSAGE_TYPES = [
  "interview",
  "rejection",
  "offer",
  "update",
  "other",
] as const;
export type PostApplicationMessageType =
  (typeof POST_APPLICATION_MESSAGE_TYPES)[number];

export const POST_APPLICATION_ROUTER_STAGE_TARGETS = [
  "no_change",
  "applied",
  "recruiter_screen",
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
  "rejected",
  "withdrawn",
  "closed",
] as const;
export type PostApplicationRouterStageTarget =
  (typeof POST_APPLICATION_ROUTER_STAGE_TARGETS)[number];

export const POST_APPLICATION_PROCESSING_STATUSES = [
  "auto_linked",
  "pending_user",
  "manual_linked",
  "ignored",
] as const;
export type PostApplicationProcessingStatus =
  (typeof POST_APPLICATION_PROCESSING_STATUSES)[number];

export interface PostApplicationIntegration {
  id: string;
  provider: PostApplicationProvider;
  accountKey: string;
  displayName: string | null;
  status: PostApplicationIntegrationStatus;
  credentials: Record<string, unknown> | null;
  lastConnectedAt: number | null;
  lastSyncedAt: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostApplicationSyncRun {
  id: string;
  provider: PostApplicationProvider;
  accountKey: string;
  integrationId: string | null;
  status: PostApplicationSyncRunStatus;
  startedAt: number;
  completedAt: number | null;
  messagesDiscovered: number;
  messagesRelevant: number;
  messagesClassified: number;
  messagesMatched: number;
  messagesApproved: number;
  messagesDenied: number;
  messagesErrored: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostApplicationMessage {
  id: string;
  provider: PostApplicationProvider;
  accountKey: string;
  integrationId: string | null;
  syncRunId: string | null;
  externalMessageId: string;
  externalThreadId: string | null;
  fromAddress: string;
  fromDomain: string | null;
  senderName: string | null;
  subject: string;
  receivedAt: number;
  snippet: string;
  classificationLabel: string | null;
  classificationConfidence: number | null;
  classificationPayload: Record<string, unknown> | null;
  relevanceLlmScore: number | null;
  relevanceDecision: PostApplicationRelevanceDecision;
  matchedJobId: string | null;
  matchConfidence: number | null;
  stageTarget: PostApplicationRouterStageTarget | null;
  messageType: PostApplicationMessageType;
  stageEventPayload: Record<string, unknown> | null;
  processingStatus: PostApplicationProcessingStatus;
  decidedAt: number | null;
  decidedBy: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostApplicationProviderActionConnectRequest {
  accountKey?: string;
  payload?: Record<string, unknown>;
}

export interface PostApplicationProviderActionSyncRequest {
  accountKey?: string;
  maxMessages?: number;
  searchDays?: number;
}

export interface PostApplicationProviderStatus {
  provider: PostApplicationProvider;
  accountKey: string;
  connected: boolean;
  integration: PostApplicationIntegration | null;
}

export interface PostApplicationProviderActionResponse {
  provider: PostApplicationProvider;
  action: PostApplicationProviderAction;
  accountKey: string;
  status: PostApplicationProviderStatus;
  message?: string;
}

export interface PostApplicationInboxItem {
  message: PostApplicationMessage;
  matchedJob?: {
    id: string;
    title: string;
    employer: string;
  } | null;
}

export type PostApplicationAction = "approve" | "deny";

export interface PostApplicationActionRequest {
  action: PostApplicationAction;
  provider: PostApplicationProvider;
  accountKey: string;
}

export type PostApplicationActionResult =
  | {
      messageId: string;
      ok: true;
      message: PostApplicationMessage;
      stageEventId?: string | null;
    }
  | {
      messageId: string;
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export interface PostApplicationActionResponse {
  action: PostApplicationAction;
  requested: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: PostApplicationActionResult[];
}

export const JOB_CHAT_MESSAGE_ROLES = [
  "system",
  "user",
  "assistant",
  "tool",
] as const;
export type JobChatMessageRole = (typeof JOB_CHAT_MESSAGE_ROLES)[number];

export const JOB_CHAT_MESSAGE_STATUSES = [
  "complete",
  "partial",
  "cancelled",
  "failed",
] as const;
export type JobChatMessageStatus = (typeof JOB_CHAT_MESSAGE_STATUSES)[number];

export const JOB_CHAT_RUN_STATUSES = [
  "running",
  "completed",
  "cancelled",
  "failed",
] as const;
export type JobChatRunStatus = (typeof JOB_CHAT_RUN_STATUSES)[number];

export interface JobChatThread {
  id: string;
  jobId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface JobChatMessage {
  id: string;
  threadId: string;
  jobId: string;
  role: JobChatMessageRole;
  content: string;
  status: JobChatMessageStatus;
  tokensIn: number | null;
  tokensOut: number | null;
  version: number;
  replacesMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobChatRun {
  id: string;
  threadId: string;
  jobId: string;
  status: JobChatRunStatus;
  model: string | null;
  provider: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: number;
  completedAt: number | null;
  requestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type JobChatStreamEvent =
  | {
      type: "ready";
      runId: string;
      threadId: string;
      messageId: string;
      requestId: string;
    }
  | {
      type: "delta";
      runId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: "completed";
      runId: string;
      message: JobChatMessage;
    }
  | {
      type: "cancelled";
      runId: string;
      message: JobChatMessage;
    }
  | {
      type: "error";
      runId: string;
      code: string;
      message: string;
      requestId: string;
    };

import type {
  BranchInfo,
  JobChatMessage,
  JobChatStreamEvent,
  JobChatThread,
} from "@shared/types";
import { fetchApi, streamSseEvents, withQuery } from "./core";

export async function listJobChatThreads(jobId: string): Promise<{
  threads: JobChatThread[];
}> {
  return fetchApi<{ threads: JobChatThread[] }>(
    withQuery(`/jobs/${jobId}/chat/threads`, { t: Date.now() }),
  );
}

export async function listJobGhostwriterMessages(
  jobId: string,
  options?: { limit?: number; offset?: number },
): Promise<{
  messages: JobChatMessage[];
  branches: BranchInfo[];
  selectedNoteIds: string[];
}> {
  return fetchApi<{
    messages: JobChatMessage[];
    branches: BranchInfo[];
    selectedNoteIds: string[];
  }>(
    withQuery(`/jobs/${jobId}/chat/messages`, {
      limit: options?.limit,
      offset: options?.offset,
    }),
  );
}

export async function updateJobGhostwriterContext(
  jobId: string,
  input: { selectedNoteIds: string[] },
): Promise<{ selectedNoteIds: string[] }> {
  return fetchApi<{ selectedNoteIds: string[] }>(
    `/jobs/${jobId}/chat/context`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function createJobChatThread(
  jobId: string,
  input?: { title?: string | null },
): Promise<{ thread: JobChatThread }> {
  return fetchApi<{ thread: JobChatThread }>(`/jobs/${jobId}/chat/threads`, {
    method: "POST",
    body: JSON.stringify({
      title: input?.title ?? null,
    }),
  });
}

export async function listJobChatMessages(
  jobId: string,
  threadId: string,
  options?: { limit?: number; offset?: number },
): Promise<{ messages: JobChatMessage[] }> {
  return fetchApi<{ messages: JobChatMessage[] }>(
    withQuery(
      `/jobs/${jobId}/chat/threads/${encodeURIComponent(threadId)}/messages`,
      {
        limit: options?.limit,
        offset: options?.offset,
        t: Date.now(),
      },
    ),
  );
}

export async function sendJobChatMessage(
  jobId: string,
  threadId: string,
  input: { content: string; selectedNoteIds?: string[] },
): Promise<{
  userMessage: JobChatMessage;
  assistantMessage: JobChatMessage | null;
  runId: string;
}> {
  return fetchApi(
    `/jobs/${jobId}/chat/threads/${encodeURIComponent(threadId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function streamJobChatMessage(
  jobId: string,
  threadId: string,
  input: { content: string; selectedNoteIds?: string[]; signal?: AbortSignal },
  handlers: {
    onEvent: (event: JobChatStreamEvent) => void;
  },
): Promise<void> {
  return streamSseEvents<JobChatStreamEvent>(
    `/jobs/${jobId}/chat/threads/${encodeURIComponent(threadId)}/messages`,
    { ...input, stream: true },
    {
      onEvent: handlers.onEvent,
      signal: input.signal,
    },
  );
}

export async function streamJobGhostwriterMessage(
  jobId: string,
  input: { content: string; selectedNoteIds?: string[]; signal?: AbortSignal },
  handlers: {
    onEvent: (event: JobChatStreamEvent) => void;
  },
): Promise<void> {
  return streamSseEvents<JobChatStreamEvent>(
    `/jobs/${jobId}/chat/messages`,
    {
      content: input.content,
      selectedNoteIds: input.selectedNoteIds,
      stream: true,
    },
    {
      onEvent: handlers.onEvent,
      signal: input.signal,
    },
  );
}

export async function cancelJobChatRun(
  jobId: string,
  threadId: string,
  runId: string,
): Promise<{ cancelled: boolean; alreadyFinished: boolean }> {
  return fetchApi(
    `/jobs/${jobId}/chat/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function resetJobGhostwriterConversation(
  jobId: string,
): Promise<{ deletedMessages: number; deletedRuns: number }> {
  return fetchApi(`/jobs/${jobId}/chat/reset`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelJobGhostwriterRun(
  jobId: string,
  runId: string,
): Promise<{ cancelled: boolean; alreadyFinished: boolean }> {
  return fetchApi(
    `/jobs/${jobId}/chat/runs/${encodeURIComponent(runId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function regenerateJobChatMessage(
  jobId: string,
  threadId: string,
  assistantMessageId: string,
): Promise<{ runId: string; assistantMessage: JobChatMessage | null }> {
  return fetchApi(
    `/jobs/${jobId}/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(assistantMessageId)}/regenerate`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function streamRegenerateJobChatMessage(
  jobId: string,
  threadId: string,
  assistantMessageId: string,
  input: { selectedNoteIds?: string[]; signal?: AbortSignal },
  handlers: {
    onEvent: (event: JobChatStreamEvent) => void;
  },
): Promise<void> {
  return streamSseEvents<JobChatStreamEvent>(
    `/jobs/${jobId}/chat/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(assistantMessageId)}/regenerate`,
    { selectedNoteIds: input.selectedNoteIds, stream: true },
    {
      onEvent: handlers.onEvent,
      signal: input.signal,
    },
  );
}

export async function streamRegenerateJobGhostwriterMessage(
  jobId: string,
  assistantMessageId: string,
  input: { selectedNoteIds?: string[]; signal?: AbortSignal },
  handlers: {
    onEvent: (event: JobChatStreamEvent) => void;
  },
): Promise<void> {
  return streamSseEvents<JobChatStreamEvent>(
    `/jobs/${jobId}/chat/messages/${encodeURIComponent(assistantMessageId)}/regenerate`,
    { selectedNoteIds: input.selectedNoteIds, stream: true },
    {
      onEvent: handlers.onEvent,
      signal: input.signal,
    },
  );
}

export async function editJobGhostwriterMessage(
  jobId: string,
  messageId: string,
  input: { content: string; selectedNoteIds?: string[]; signal?: AbortSignal },
  handlers: {
    onEvent: (event: JobChatStreamEvent) => void;
  },
): Promise<void> {
  return streamSseEvents<JobChatStreamEvent>(
    `/jobs/${jobId}/chat/messages/${encodeURIComponent(messageId)}/edit`,
    {
      content: input.content,
      selectedNoteIds: input.selectedNoteIds,
      stream: true,
    },
    {
      onEvent: handlers.onEvent,
      signal: input.signal,
    },
  );
}

export async function switchJobGhostwriterBranch(
  jobId: string,
  messageId: string,
): Promise<{ messages: JobChatMessage[]; branches: BranchInfo[] }> {
  return fetchApi(
    `/jobs/${jobId}/chat/messages/${encodeURIComponent(messageId)}/switch-branch`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

import type {
  Job,
  JobChatMessage,
  JobChatStreamEvent,
  JobChatThread,
} from "@shared/types";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { RunControls } from "./RunControls";
import { ThreadList } from "./ThreadList";

type GhostwriterPanelProps = {
  job: Job;
};

export const GhostwriterPanel: React.FC<GhostwriterPanelProps> = ({ job }) => {
  const [threads, setThreads] = useState<JobChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<JobChatMessage[]>([]);
  const [threadPreviews, setThreadPreviews] = useState<Record<string, string>>(
    {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const streamAbortRef = useRef<AbortController | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;
    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom < 120 || isStreaming) {
      container.scrollTop = container.scrollHeight;
    }
  });

  const loadThreadMessages = useCallback(
    async (threadId: string) => {
      const data = await api.listJobChatMessages(job.id, threadId, {
        limit: 300,
      });
      setMessages(data.messages);
      const preview = [...data.messages]
        .reverse()
        .find((message) => !!message.content.trim())?.content;
      if (preview) {
        setThreadPreviews((current) => ({ ...current, [threadId]: preview }));
      }
    },
    [job.id],
  );

  const createThread = useCallback(async () => {
    const created = await api.createJobChatThread(job.id, {
      title: `${job.title} @ ${job.employer}`,
    });
    setThreads((current) => [created.thread, ...current]);
    setThreadPreviews((current) => ({ ...current, [created.thread.id]: "" }));
    setActiveThreadId(created.thread.id);
    setMessages([]);
    return created.thread;
  }, [job.id, job.title, job.employer]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.listJobChatThreads(job.id);
      const nextThreads = data.threads;
      setThreads(nextThreads);

      let threadId = nextThreads[0]?.id ?? null;
      if (!threadId) {
        const created = await createThread();
        threadId = created.id;
      }

      setActiveThreadId(threadId);
      if (threadId) {
        await loadThreadMessages(threadId);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load Ghostwriter";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [job.id, createThread, loadThreadMessages]);

  useEffect(() => {
    void load();
    return () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    };
  }, [load]);

  const onStreamEvent = useCallback(
    (event: JobChatStreamEvent) => {
      if (event.type === "ready") {
        setActiveRunId(event.runId);
        setStreamingMessageId(event.messageId);
        setMessages((current) => {
          if (current.some((message) => message.id === event.messageId))
            return current;
          return [
            ...current,
            {
              id: event.messageId,
              threadId: event.threadId,
              jobId: job.id,
              role: "assistant",
              content: "",
              status: "partial",
              tokensIn: null,
              tokensOut: null,
              version: 1,
              replacesMessageId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];
        });
        return;
      }

      if (event.type === "delta") {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? {
                  ...message,
                  content: `${message.content}${event.delta}`,
                  status: "partial",
                  updatedAt: new Date().toISOString(),
                }
              : message,
          ),
        );
        const threadId = activeThreadIdRef.current;
        if (threadId) {
          setThreadPreviews((current) => ({
            ...current,
            [threadId]: `${current[threadId] ?? ""}${event.delta}`.trim(),
          }));
        }
        return;
      }

      if (event.type === "completed" || event.type === "cancelled") {
        setMessages((current) => {
          const next = current.filter(
            (message) => message.id !== event.message.id,
          );
          return [...next, event.message].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          );
        });
        setStreamingMessageId(null);
        setActiveRunId(null);
        setIsStreaming(false);
        setThreadPreviews((current) => ({
          ...current,
          [event.message.threadId]: event.message.content,
        }));
        return;
      }

      if (event.type === "error") {
        toast.error(event.message);
        setStreamingMessageId(null);
        setActiveRunId(null);
        setIsStreaming(false);
      }
    },
    [job.id],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeThreadIdRef.current || isStreaming) return;

      const threadId = activeThreadIdRef.current;
      const optimisticUser: JobChatMessage = {
        id: `tmp-user-${Date.now()}`,
        threadId,
        jobId: job.id,
        role: "user",
        content,
        status: "complete",
        tokensIn: null,
        tokensOut: null,
        version: 1,
        replacesMessageId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, optimisticUser]);
      setThreadPreviews((current) => ({ ...current, [threadId]: content }));
      setIsStreaming(true);

      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        await api.streamJobChatMessage(
          job.id,
          threadId,
          { content, signal: controller.signal },
          { onEvent: onStreamEvent },
        );

        await loadThreadMessages(threadId);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to send message";
        toast.error(message);
      } finally {
        streamAbortRef.current = null;
        setIsStreaming(false);
      }
    },
    [isStreaming, job.id, loadThreadMessages, onStreamEvent],
  );

  const stopStreaming = useCallback(async () => {
    if (!activeThreadId || !activeRunId) return;
    try {
      await api.cancelJobChatRun(job.id, activeThreadId, activeRunId);
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      setIsStreaming(false);
      setActiveRunId(null);
      setStreamingMessageId(null);
      await loadThreadMessages(activeThreadId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to stop run";
      toast.error(message);
    }
  }, [activeThreadId, activeRunId, job.id, loadThreadMessages]);

  const canRegenerate = useMemo(() => {
    if (isStreaming || messages.length === 0) return false;
    const last = messages[messages.length - 1];
    return last.role === "assistant";
  }, [isStreaming, messages]);

  const regenerate = useCallback(async () => {
    if (!activeThreadId || isStreaming || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;

    setIsStreaming(true);
    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      await api.streamRegenerateJobChatMessage(
        job.id,
        activeThreadId,
        last.id,
        { signal: controller.signal },
        { onEvent: onStreamEvent },
      );
      await loadThreadMessages(activeThreadId);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Failed to regenerate response";
      toast.error(message);
    } finally {
      streamAbortRef.current = null;
      setIsStreaming(false);
    }
  }, [
    activeThreadId,
    isStreaming,
    job.id,
    loadThreadMessages,
    messages,
    onStreamEvent,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]">
        <ThreadList
          job={job}
          threads={threads}
          previews={threadPreviews}
          activeThreadId={activeThreadId}
          onSelectThread={(threadId) => {
            setActiveThreadId(threadId);
            void loadThreadMessages(threadId);
          }}
          onCreateThread={() => {
            void createThread();
          }}
          disabled={isLoading || isStreaming}
        />

        <div className="flex min-h-0 flex-1 flex-col border-t border-border/50 pt-4 md:border-t-0 md:border-l md:pl-4 md:pt-0">
          <div
            ref={messageListRef}
            className="min-h-0 flex-1 overflow-y-auto pr-1"
          >
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              streamingMessageId={streamingMessageId}
            />
          </div>

          <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
            <RunControls
              isStreaming={isStreaming}
              canRegenerate={canRegenerate}
              onStop={stopStreaming}
              onRegenerate={regenerate}
            />

            <Composer
              disabled={isLoading || isStreaming || !activeThreadId}
              onSend={sendMessage}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

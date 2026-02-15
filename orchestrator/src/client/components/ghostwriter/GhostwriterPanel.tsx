import type { Job, JobChatMessage, JobChatStreamEvent } from "@shared/types";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

type GhostwriterPanelProps = {
  job: Job;
};

export const GhostwriterPanel: React.FC<GhostwriterPanelProps> = ({ job }) => {
  const [messages, setMessages] = useState<JobChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;
    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom < 120 || isStreaming) {
      container.scrollTop = container.scrollHeight;
    }
  });

  const loadMessages = useCallback(async () => {
    const data = await api.listJobGhostwriterMessages(job.id, {
      limit: 300,
    });
    setMessages(data.messages);
  }, [job.id]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadMessages();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load Ghostwriter";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [loadMessages]);

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
          if (current.some((message) => message.id === event.messageId)) {
            return current;
          }
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
      if (isStreaming) return;

      const optimisticUser: JobChatMessage = {
        id: `tmp-user-${Date.now()}`,
        threadId: messages[messages.length - 1]?.threadId || "pending-thread",
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
      setIsStreaming(true);

      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        await api.streamJobGhostwriterMessage(
          job.id,
          { content, signal: controller.signal },
          { onEvent: onStreamEvent },
        );

        await loadMessages();
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
    [isStreaming, job.id, loadMessages, messages, onStreamEvent],
  );

  const stopStreaming = useCallback(async () => {
    if (!activeRunId) return;
    try {
      await api.cancelJobGhostwriterRun(job.id, activeRunId);
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      setIsStreaming(false);
      setActiveRunId(null);
      setStreamingMessageId(null);
      await loadMessages();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to stop run";
      toast.error(message);
    }
  }, [activeRunId, job.id, loadMessages]);

  const canRegenerate = useMemo(() => {
    if (isStreaming || messages.length === 0) return false;
    const last = messages[messages.length - 1];
    return last.role === "assistant";
  }, [isStreaming, messages]);

  const regenerate = useCallback(async () => {
    if (isStreaming || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;

    setIsStreaming(true);
    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      await api.streamRegenerateJobGhostwriterMessage(
        job.id,
        last.id,
        { signal: controller.signal },
        { onEvent: onStreamEvent },
      );
      await loadMessages();
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
  }, [isStreaming, job.id, loadMessages, messages, onStreamEvent]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div
        ref={messageListRef}
        className="min-h-0 flex-1 overflow-y-auto border-b border-border/50 pb-3 pr-1"
      >
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          streamingMessageId={streamingMessageId}
        />
      </div>

      <div className="mt-4">
        <Composer
          disabled={isLoading || isStreaming}
          isStreaming={isStreaming}
          canRegenerate={canRegenerate}
          onRegenerate={regenerate}
          onStop={stopStreaming}
          onSend={sendMessage}
        />
      </div>
    </div>
  );
};

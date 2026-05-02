import * as api from "@client/api";
import type {
  BranchInfo,
  Job,
  JobChatMessage,
  JobChatStreamEvent,
  JobNote,
} from "@shared/types";
import { Settings2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { bucketQueryLength, trackProductEvent } from "@/lib/analytics";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { NoteContextSelector } from "./NoteContextSelector";

type GhostwriterPanelProps = {
  job: Job;
  initialPrompt?: string | null;
  onInitialPromptConsumed?: () => void;
};

export const GhostwriterPanel: React.FC<GhostwriterPanelProps> = ({
  job,
  initialPrompt,
  onInitialPromptConsumed,
}) => {
  const [messages, setMessages] = useState<JobChatMessage[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [areNotesLoading, setAreNotesLoading] = useState(true);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const consumedInitialPromptRef = useRef<string | null>(null);
  const runTriggerRef = useRef<"new_prompt" | "regenerate" | "edit">(
    "new_prompt",
  );

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
    setBranches(data.branches);
    setSelectedNoteIds(data.selectedNoteIds);
  }, [job.id]);

  const loadNotes = useCallback(async () => {
    setAreNotesLoading(true);
    try {
      const data = await api.getJobNotes(job.id);
      setNotes(data);
    } catch (error) {
      showErrorToast(error, "Failed to load notes");
    } finally {
      setAreNotesLoading(false);
    }
  }, [job.id]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadMessages(), loadNotes()]);
    } catch (error) {
      showErrorToast(error, "Failed to load Ghostwriter");
    } finally {
      setIsLoading(false);
    }
  }, [loadMessages, loadNotes]);

  useEffect(() => {
    void load();
    return () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    };
  }, [load]);

  useEffect(() => {
    if (areNotesLoading) return;
    const noteIds = new Set(notes.map((note) => note.id));
    setSelectedNoteIds((current) =>
      current.filter((noteId) => noteIds.has(noteId)),
    );
  }, [areNotesLoading, notes]);

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
              parentMessageId: null,
              activeChildId: null,
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
        if (event.type === "completed") {
          trackProductEvent("ghostwriter_response_completed", {
            trigger: runTriggerRef.current,
            message_length_bucket: bucketQueryLength(event.message.content),
          });
        }
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
        parentMessageId: null,
        activeChildId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, optimisticUser]);
      setIsStreaming(true);
      runTriggerRef.current = "new_prompt";

      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        await api.streamJobGhostwriterMessage(
          job.id,
          { content, selectedNoteIds, signal: controller.signal },
          { onEvent: onStreamEvent },
        );

        await loadMessages();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        showErrorToast(error, "Failed to send message");
      } finally {
        streamAbortRef.current = null;
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      job.id,
      loadMessages,
      messages,
      onStreamEvent,
      selectedNoteIds,
    ],
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
      showErrorToast(error, "Failed to stop run");
    }
  }, [activeRunId, job.id, loadMessages]);

  const regenerate = useCallback(
    async (assistantMessageId: string) => {
      if (isStreaming) return;

      // Remove messages below the branch point (everything after the regenerated message disappears)
      setMessages((current) => {
        const targetIndex = current.findIndex(
          (m) => m.id === assistantMessageId,
        );
        if (targetIndex === -1) return current;
        return current.slice(0, targetIndex);
      });

      setIsStreaming(true);
      runTriggerRef.current = "regenerate";
      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        await api.streamRegenerateJobGhostwriterMessage(
          job.id,
          assistantMessageId,
          { selectedNoteIds, signal: controller.signal },
          { onEvent: onStreamEvent },
        );
        await loadMessages();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        showErrorToast(error, "Failed to regenerate response");
      } finally {
        streamAbortRef.current = null;
        setIsStreaming(false);
      }
    },
    [isStreaming, job.id, loadMessages, onStreamEvent, selectedNoteIds],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (isStreaming) return;

      // Remove the edited message and everything below it (old branch disappears)
      setMessages((current) => {
        const targetIndex = current.findIndex((m) => m.id === messageId);
        if (targetIndex === -1) return current;
        // Keep everything before the edited message, add an optimistic new user message
        const before = current.slice(0, targetIndex);
        return [
          ...before,
          {
            id: `tmp-edit-${Date.now()}`,
            threadId: current[0]?.threadId || "pending-thread",
            jobId: job.id,
            role: "user" as const,
            content,
            status: "complete" as const,
            tokensIn: null,
            tokensOut: null,
            version: 1,
            replacesMessageId: null,
            parentMessageId: null,
            activeChildId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      });

      setIsStreaming(true);
      runTriggerRef.current = "edit";
      const controller = new AbortController();
      streamAbortRef.current = controller;

      try {
        await api.editJobGhostwriterMessage(
          job.id,
          messageId,
          { content, selectedNoteIds, signal: controller.signal },
          { onEvent: onStreamEvent },
        );
        await loadMessages();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        showErrorToast(error, "Failed to edit message");
      } finally {
        streamAbortRef.current = null;
        setIsStreaming(false);
      }
    },
    [isStreaming, job.id, loadMessages, onStreamEvent, selectedNoteIds],
  );

  const updateSelectedNotes = useCallback(
    async (nextSelectedNoteIds: string[]) => {
      const previousSelectedNoteIds = selectedNoteIds;
      setSelectedNoteIds(nextSelectedNoteIds);
      setIsSavingContext(true);

      try {
        const result = await api.updateJobGhostwriterContext(job.id, {
          selectedNoteIds: nextSelectedNoteIds,
        });
        setSelectedNoteIds(result.selectedNoteIds);
      } catch (error) {
        setSelectedNoteIds(previousSelectedNoteIds);
        showErrorToast(error, "Failed to update Ghostwriter notes");
      } finally {
        setIsSavingContext(false);
      }
    },
    [job.id, selectedNoteIds],
  );

  const switchBranch = useCallback(
    async (messageId: string) => {
      try {
        const result = await api.switchJobGhostwriterBranch(job.id, messageId);
        setMessages(result.messages);
        setBranches(result.branches);
      } catch (error) {
        showErrorToast(error, "Failed to switch branch");
      }
    },
    [job.id],
  );

  const canReset = useMemo(() => {
    return !isStreaming && messages.length > 0;
  }, [isStreaming, messages]);

  useEffect(() => {
    const content = initialPrompt?.trim();
    if (!content || isLoading || isStreaming) return;
    if (consumedInitialPromptRef.current === content) return;

    consumedInitialPromptRef.current = content;
    onInitialPromptConsumed?.();
    void sendMessage(content);
  }, [
    initialPrompt,
    isLoading,
    isStreaming,
    onInitialPromptConsumed,
    sendMessage,
  ]);

  const resetConversation = useCallback(async () => {
    try {
      await api.resetJobGhostwriterConversation(job.id);
      setMessages([]);
      setBranches([]);
      toast.success("Conversation cleared");
    } catch (error) {
      showErrorToast(error, "Failed to reset conversation");
    }
  }, [job.id]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col max-w-6xl mx-auto">
      <div
        ref={messageListRef}
        className="min-h-0 flex-1 overflow-y-auto border-b border-border/50 pb-3 pr-1"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="flex h-full min-h-[260px] justify-center px-3 flex-col text-left">
            <h4 className="font-medium">
              {job.title} at {job.employer}
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Ghostwriter already has this job description, your resume and your
              writing style preferences. Ask for tailored response drafts, or
              concise role-fit talking points.
            </p>
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 w-fit"
                asChild
              >
                <Link to="/settings#chat">
                  <Settings2 className="h-4 w-4" />
                  Alter personality
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            branches={branches}
            isStreaming={isStreaming}
            streamingMessageId={streamingMessageId}
            onRegenerate={regenerate}
            onEdit={editMessage}
            onSwitchBranch={switchBranch}
          />
        )}
      </div>

      <div className="mt-4">
        <Composer
          disabled={isLoading || isStreaming}
          isStreaming={isStreaming}
          canReset={canReset}
          noteContextSelector={
            <NoteContextSelector
              notes={notes}
              selectedNoteIds={selectedNoteIds}
              disabled={isLoading || isStreaming}
              isLoading={areNotesLoading}
              isSaving={isSavingContext}
              onChange={(nextSelectedNoteIds) =>
                void updateSelectedNotes(nextSelectedNoteIds)
              }
            />
          }
          onStop={stopStreaming}
          onSend={sendMessage}
          onReset={() => setIsResetDialogOpen(true)}
        />
      </div>

      <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently erase the entire conversation. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void resetConversation()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Erase conversation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

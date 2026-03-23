import type { BranchInfo, JobChatMessage } from "@shared/types";
import { Check, Copy, Pencil, RefreshCcw } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BranchNavigator } from "./BranchNavigator";
import { StreamingMessage } from "./StreamingMessage";

type MessageListProps = {
  messages: JobChatMessage[];
  branches: BranchInfo[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  onRegenerate: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onSwitchBranch: (messageId: string) => void;
};

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  branches,
  isStreaming,
  streamingMessageId,
  onRegenerate,
  onEdit,
  onSwitchBranch,
}) => {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  const branchMap = new Map<string, BranchInfo>();
  for (const branch of branches) {
    branchMap.set(branch.messageId, branch);
  }

  const startEditing = (message: JobChatMessage) => {
    setEditingMessageId(message.id);
    setEditContent(message.content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditContent("");
  };

  const submitEdit = (messageId: string) => {
    const content = editContent.trim();
    if (!content) return;
    onEdit(messageId, content);
    setEditingMessageId(null);
    setEditContent("");
  };

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const copyMessage = async (messageId: string, content: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("Copy is not available in this browser context");
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageId(null);
        copiedTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to copy response";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-3">
      {messages.length > 0 &&
        messages.map((message) => {
          const isUser = message.role === "user";
          const isActiveStreaming =
            isStreaming &&
            message.role === "assistant" &&
            streamingMessageId === message.id;
          const isEditing = editingMessageId === message.id;
          const canCopyResponse =
            message.role === "assistant" &&
            message.status === "complete" &&
            !isStreaming &&
            !isActiveStreaming;
          const branch = branchMap.get(message.id);

          return (
            <div
              key={message.id}
              className={`group rounded-lg border p-3 ${
                isUser
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/60 bg-background"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {isUser ? "You" : "Ghostwriter"}
                </span>
                {branch && (
                  <BranchNavigator
                    branchInfo={branch}
                    onSwitch={onSwitchBranch}
                  />
                )}
                <div className="ml-auto flex items-center gap-1 opacity-100 transition-opacity sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100">
                  {isUser && !isStreaming && !isEditing && (
                    <button
                      type="button"
                      onClick={() => startEditing(message)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      aria-label="Edit message"
                      title="Edit message"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {!isUser && !isStreaming && !isActiveStreaming && (
                    <>
                      {canCopyResponse ? (
                        <button
                          type="button"
                          onClick={() =>
                            void copyMessage(message.id, message.content)
                          }
                          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          aria-label="Copy response"
                          title="Copy response"
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>
                            {copiedMessageId === message.id ? "Copied" : "Copy"}
                          </span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onRegenerate(message.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        aria-label="Regenerate response"
                        title="Regenerate response"
                      >
                        <RefreshCcw className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        cancelEditing();
                      }
                    }}
                    className="min-h-[60px]"
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => submitEdit(message.id)}
                      disabled={!editContent.trim()}
                    >
                      Submit
                    </Button>
                  </div>
                </div>
              ) : isActiveStreaming ? (
                <StreamingMessage content={message.content} />
              ) : message.role === "assistant" ? (
                <div className="text-sm leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-border [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted/40 [&_code]:px-1 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted/40 [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content || "..."}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {message.content}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

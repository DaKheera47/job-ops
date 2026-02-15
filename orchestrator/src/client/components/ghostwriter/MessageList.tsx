import type { JobChatMessage } from "@shared/types";
import type React from "react";
import { StreamingMessage } from "./StreamingMessage";

type MessageListProps = {
  messages: JobChatMessage[];
  isStreaming: boolean;
  streamingMessageId: string | null;
};

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming,
  streamingMessageId,
}) => {
  return (
    <div className="space-y-3">
      {messages.length > 0 &&
        messages.map((message) => {
          const isUser = message.role === "user";
          const isActiveStreaming =
            isStreaming &&
            message.role === "assistant" &&
            streamingMessageId === message.id;

          return (
            <div
              key={message.id}
              className={`rounded-lg border p-3 ${
                isUser
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/60 bg-background"
              }`}
            >
              <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {isUser
                  ? "You"
                  : `Ghostwriter${message.version > 1 ? ` v${message.version}` : ""}`}
              </div>
              {isActiveStreaming ? (
                <StreamingMessage content={message.content} />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {message.content ||
                    (message.role === "assistant" ? "..." : "")}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

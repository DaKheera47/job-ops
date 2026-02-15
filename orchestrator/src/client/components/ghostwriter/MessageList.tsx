import type { JobChatMessage } from "@shared/types";
import type React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

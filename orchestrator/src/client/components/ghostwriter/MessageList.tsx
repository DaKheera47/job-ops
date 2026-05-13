import {
  type AiAssistMessage,
  AiAssistMessageList,
} from "@client/components/ai-assist/AiAssistMessageList";
import type {
  BranchInfo,
  JobChatImageAttachment,
  JobChatMessage,
} from "@shared/types";
import type React from "react";
import { bucketQueryLength, trackProductEvent } from "@/lib/analytics";

type MessageListProps = {
  messages: JobChatMessage[];
  branches: BranchInfo[];
  isStreaming: boolean;
  streamingMessageId: string | null;
  onRegenerate: (messageId: string) => void;
  onEdit: (
    messageId: string,
    content: string,
    attachments: JobChatImageAttachment[],
  ) => void;
  onSwitchBranch: (messageId: string) => void;
};

function toAiAssistMessage(message: JobChatMessage): AiAssistMessage {
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    status: message.status,
    attachments: message.attachments,
  };
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  branches,
  isStreaming,
  streamingMessageId,
  onRegenerate,
  onEdit,
  onSwitchBranch,
}) => (
  <AiAssistMessageList
    messages={messages
      .filter(
        (message) => message.role === "user" || message.role === "assistant",
      )
      .map(toAiAssistMessage)}
    branches={branches}
    isStreaming={isStreaming}
    streamingMessageId={streamingMessageId}
    assistantLabel="Ghostwriter"
    onRegenerate={onRegenerate}
    onEdit={onEdit}
    onSwitchBranch={onSwitchBranch}
    onAssistantCopy={(message) =>
      trackProductEvent("ghostwriter_response_copied", {
        message_length_bucket: bucketQueryLength(message.content),
      })
    }
  />
);

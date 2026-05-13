import { AiAssistComposer } from "@client/components/ai-assist/AiAssistComposer";
import type { JobChatImageAttachment } from "@shared/types";
import type React from "react";

type ComposerProps = {
  disabled?: boolean;
  isStreaming: boolean;
  canReset: boolean;
  noteContextSelector?: React.ReactNode;
  onStop: () => Promise<void>;
  onSend: (
    content: string,
    attachments: JobChatImageAttachment[],
  ) => Promise<void>;
  onReset: () => void;
};

export const Composer: React.FC<ComposerProps> = ({
  disabled,
  isStreaming,
  canReset,
  noteContextSelector,
  onStop,
  onSend,
  onReset,
}) => (
  <AiAssistComposer
    disabled={disabled}
    isStreaming={isStreaming}
    canReset={canReset}
    contextSlot={noteContextSelector}
    placeholder="Ask anything about this job..."
    allowScreenshots
    onStop={onStop}
    onSend={onSend}
    onReset={onReset}
  />
);

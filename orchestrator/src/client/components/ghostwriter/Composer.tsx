import { getMetaShortcutLabel, isMetaKeyPressed } from "@client/lib/meta-key";
import { Eraser, RefreshCcw, Send, Square } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ComposerProps = {
  disabled?: boolean;
  isStreaming: boolean;
  canRegenerate: boolean;
  canReset: boolean;
  onRegenerate: () => Promise<void>;
  onStop: () => Promise<void>;
  onSend: (content: string) => Promise<void>;
  onReset: () => void;
};

export const Composer: React.FC<ComposerProps> = ({
  disabled,
  isStreaming,
  canRegenerate,
  canReset,
  onRegenerate,
  onStop,
  onSend,
  onReset,
}) => {
  const [value, setValue] = useState("");

  const submit = async () => {
    const content = value.trim();
    if (!content || disabled) return;
    setValue("");
    await onSend(content);
  };

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Ask anything about this job..."
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        onKeyDown={(event) => {
          if (isMetaKeyPressed(event) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        className="min-h-[84px]"
      />
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground">
          {getMetaShortcutLabel("Enter")} to send
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={onReset}
            disabled={disabled || !canReset}
            aria-label="Start over"
            title="Start over"
            className="text-destructive hover:text-destructive"
          >
            <Eraser className="h-3.5 w-3.5" />
          </Button>

          {isStreaming ? (
            <Button
              size="icon"
              variant="outline"
              onClick={() => void onStop()}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="outline"
              onClick={() => void onRegenerate()}
              disabled={disabled || !canRegenerate}
              aria-label="Regenerate response"
              title="Regenerate response"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            size="icon"
            onClick={() => void submit()}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            title="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

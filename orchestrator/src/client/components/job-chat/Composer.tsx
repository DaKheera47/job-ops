import { Send } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ComposerProps = {
  disabled?: boolean;
  onSend: (content: string) => Promise<void>;
};

export const Composer: React.FC<ComposerProps> = ({ disabled, onSend }) => {
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
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        className="min-h-[84px]"
      />
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground">
          Cmd/Ctrl+Enter to send
        </div>
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={disabled || !value.trim()}
        >
          <Send className="mr-1 h-3.5 w-3.5" />
          Send
        </Button>
      </div>
    </div>
  );
};

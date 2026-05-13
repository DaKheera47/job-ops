import * as api from "@client/api";
import { AiAssistComposer } from "@client/components/ai-assist/AiAssistComposer";
import {
  type AiAssistMessage,
  AiAssistMessageList,
} from "@client/components/ai-assist/AiAssistMessageList";
import type {
  DesignResumeAiFieldValueType,
  DesignResumeJson,
  JobChatImageAttachment,
} from "@shared/types";
import { Check, Sparkles, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type FieldValue = string | string[];

type PendingSuggestion = {
  messageId: string;
  value: FieldValue;
  valueType: DesignResumeAiFieldValueType;
};

type DesignResumeFieldAssistantProps = {
  resumeJson: DesignResumeJson;
  fieldPath: string;
  label: string;
  value: FieldValue;
  valueType: DesignResumeAiFieldValueType;
  section?: string | null;
  itemLabel?: string | null;
  triggerClassName?: string;
  onApply: (value: FieldValue) => void;
};

function isEmptyValue(value: FieldValue): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value.replace(/<[^>]*>/g, "").trim().length === 0;
}

function formatSuggestion(value: FieldValue): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

function makeMessage(
  role: AiAssistMessage["role"],
  content: string,
): AiAssistMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    status: "complete",
    attachments: [],
  };
}

export const DesignResumeFieldAssistant: React.FC<
  DesignResumeFieldAssistantProps
> = ({
  resumeJson,
  fieldPath,
  label,
  value,
  valueType,
  section = null,
  itemLabel = null,
  triggerClassName,
  onApply,
}) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiAssistMessage[]>([]);
  const [pendingSuggestion, setPendingSuggestion] =
    useState<PendingSuggestion | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const currentValueRef = useRef(value);
  currentValueRef.current = value;

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const resetSession = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setPendingSuggestion(null);
    setIsGenerating(false);
  };

  const closeSession = () => {
    resetSession();
    setOpen(false);
  };

  const sendPrompt = async (
    content: string,
    _attachments: JobChatImageAttachment[],
  ) => {
    if (isGenerating) return;

    const wasEmptyAtStart = isEmptyValue(currentValueRef.current);
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setPendingSuggestion(null);
    setMessages((current) => [...current, makeMessage("user", content)]);

    try {
      const result = await api.generateDesignResumeFieldSuggestion({
        document: resumeJson,
        field: {
          path: fieldPath,
          label,
          value: currentValueRef.current,
          valueType,
          section,
          itemLabel,
        },
        prompt: content,
        signal: controller.signal,
      });

      const assistantMessage = makeMessage(
        "assistant",
        `${result.message}\n\n${formatSuggestion(result.suggestion)}`,
      );
      setMessages((current) => [...current, assistantMessage]);

      if (wasEmptyAtStart && isEmptyValue(currentValueRef.current)) {
        onApply(result.suggestion);
        toast.success(`${label} filled with AI draft.`);
        return;
      }

      setPendingSuggestion({
        messageId: assistantMessage.id,
        value: result.suggestion,
        valueType: result.valueType,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      showErrorToast(error, "AI field edit failed");
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  };

  const applySuggestion = (suggestion: PendingSuggestion) => {
    onApply(suggestion.value);
    setPendingSuggestion(null);
    toast.success(`${label} updated.`);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setOpen(true);
          return;
        }
        closeSession();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7 text-muted-foreground transition-transform duration-150 hover:-translate-y-0.5 hover:text-foreground data-[state=open]:-translate-y-0.5 data-[state=open]:bg-primary/15 data-[state=open]:text-primary",
            triggerClassName,
          )}
          aria-label={`Open AI assistant for ${label}`}
          title={`Improve ${label} with AI`}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="relative z-[80] w-[min(26rem,calc(100vw-2rem))] origin-[--radix-popover-content-transform-origin] rounded-xl border border-border/70 bg-popover/95 p-3 shadow-2xl shadow-black/30 backdrop-blur data-[state=open]:slide-in-from-left-1 data-[state=open]:zoom-in-90"
      >
        <div className="-left-1.5 absolute top-3 h-3 w-3 rotate-45 border-b border-l border-border/70 bg-popover/95" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-foreground">
              Ghostwriter: {label}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Draft a focused replacement for this field.
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={closeSession}
            aria-label="Close AI assistant"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {messages.length > 0 ? (
          <div className="mb-3 max-h-72 overflow-y-auto pr-1">
            <AiAssistMessageList
              messages={messages}
              isStreaming={isGenerating}
              streamingMessageId={null}
              assistantLabel="Resume AI"
              renderAssistantActions={(message) =>
                pendingSuggestion?.messageId === message.id ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => applySuggestion(pendingSuggestion)}
                  >
                    <Check className="mr-2 h-3.5 w-3.5" />
                    Apply
                  </Button>
                ) : null
              }
            />
          </div>
        ) : null}

        <AiAssistComposer
          disabled={isGenerating}
          isStreaming={isGenerating}
          placeholder="Ask for a concise rewrite, stronger bullets, or clearer keywords..."
          onStop={async () => {
            abortRef.current?.abort();
            abortRef.current = null;
            setIsGenerating(false);
          }}
          onSend={sendPrompt}
        />
      </PopoverContent>
    </Popover>
  );
};

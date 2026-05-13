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

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        aria-label={`Open AI assistant for ${label}`}
        title={`Improve ${label} with AI`}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border/60 bg-background/80 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-foreground">
            AI edit: {label}
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
    </div>
  );
};

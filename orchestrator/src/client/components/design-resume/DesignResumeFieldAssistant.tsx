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
import { Check, GripHorizontal, Sparkles, X } from "lucide-react";
import type React from "react";
import { Fragment, useEffect, useRef, useState } from "react";
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

type FieldAssistantMessage = AiAssistMessage & {
  suggestion?: PendingSuggestion;
};

type DragOffset = {
  x: number;
  y: number;
};

type DragSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffset: DragOffset;
  baseLeft: number;
  baseTop: number;
  width: number;
  height: number;
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

const ASSISTANT_VIEWPORT_PADDING = 12;

function isEmptyValue(value: FieldValue): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value.replace(/<[^>]*>/g, "").trim().length === 0;
}

function clampAxis(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function clampDragOffset(
  offset: DragOffset,
  session: Pick<DragSession, "baseLeft" | "baseTop" | "width" | "height">,
): DragOffset {
  if (typeof window === "undefined") return offset;

  return {
    x: clampAxis(
      offset.x,
      ASSISTANT_VIEWPORT_PADDING - session.baseLeft,
      window.innerWidth -
        ASSISTANT_VIEWPORT_PADDING -
        session.baseLeft -
        session.width,
    ),
    y: clampAxis(
      offset.y,
      ASSISTANT_VIEWPORT_PADDING - session.baseTop,
      window.innerHeight -
        ASSISTANT_VIEWPORT_PADDING -
        session.baseTop -
        session.height,
    ),
  };
}

function getPointerClientPoint(
  event: React.PointerEvent<HTMLDivElement>,
): DragOffset | null {
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
    return null;
  }

  return { x: event.clientX, y: event.clientY };
}

function renderResumeHtmlNodes(value: string): React.ReactNode {
  if (typeof document === "undefined") return value;

  const template = document.createElement("template");
  template.innerHTML = value;

  const renderNode = (node: Node, key: string): React.ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const element = node as HTMLElement;
    const children = Array.from(element.childNodes).map((child, index) =>
      renderNode(child, `${key}-${index}`),
    );

    switch (element.tagName) {
      case "P":
        return <p key={key}>{children}</p>;
      case "UL":
        return <ul key={key}>{children}</ul>;
      case "OL":
        return <ol key={key}>{children}</ol>;
      case "LI":
        return <li key={key}>{children}</li>;
      case "STRONG":
        return <strong key={key}>{children}</strong>;
      case "EM":
        return <em key={key}>{children}</em>;
      case "BR":
        return <br key={key} />;
      default:
        return <Fragment key={key}>{children}</Fragment>;
    }
  };

  return Array.from(template.content.childNodes).map((node, index) =>
    renderNode(node, String(index)),
  );
}

function makeMessage(
  role: AiAssistMessage["role"],
  content: string,
): FieldAssistantMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    status: "complete",
    attachments: [],
  };
}

function SuggestionPreview({ suggestion }: { suggestion: PendingSuggestion }) {
  const previewClassName =
    "mt-3 rounded-md border border-border/60 bg-muted/20 p-3 text-sm leading-relaxed text-foreground";

  if (suggestion.valueType === "html" && typeof suggestion.value === "string") {
    return (
      <div
        className={`${previewClassName} [&_em]:italic [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5`}
      >
        {renderResumeHtmlNodes(suggestion.value)}
      </div>
    );
  }

  if (
    suggestion.valueType === "string_list" &&
    Array.isArray(suggestion.value)
  ) {
    return (
      <ul className={`${previewClassName} list-disc space-y-1 pl-7`}>
        {suggestion.value.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className={`${previewClassName} whitespace-pre-wrap`}>
      {Array.isArray(suggestion.value)
        ? suggestion.value.join(", ")
        : suggestion.value}
    </div>
  );
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
  const [messages, setMessages] = useState<FieldAssistantMessage[]>([]);
  const [pendingSuggestion, setPendingSuggestion] =
    useState<PendingSuggestion | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dragOffset, setDragOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
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
    setDragOffset({ x: 0, y: 0 });
    setIsDragging(false);
    dragSessionRef.current = null;
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

      const assistantMessage = makeMessage("assistant", result.message);
      const suggestion = {
        messageId: assistantMessage.id,
        value: result.suggestion,
        valueType: result.valueType,
      };
      assistantMessage.suggestion = suggestion;
      setMessages((current) => [...current, assistantMessage]);

      if (wasEmptyAtStart && isEmptyValue(currentValueRef.current)) {
        onApply(result.suggestion);
        toast.success(`${label} filled with AI draft.`);
        return;
      }

      setPendingSuggestion(suggestion);
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

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (typeof event.button === "number" && event.button !== 0) return;

    const point = getPointerClientPoint(event);
    const contentRect = contentRef.current?.getBoundingClientRect();
    if (!point || !contentRect) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    dragSessionRef.current = {
      pointerId: event.pointerId,
      startClientX: point.x,
      startClientY: point.y,
      startOffset: dragOffset,
      baseLeft: contentRect.left - dragOffset.x,
      baseTop: contentRect.top - dragOffset.y,
      width: contentRect.width,
      height: contentRect.height,
    };
    setIsDragging(true);
  };

  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const point = getPointerClientPoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();

    const nextOffset = {
      x: session.startOffset.x + point.x - session.startClientX,
      y: session.startOffset.y + point.y - session.startClientY,
    };

    setDragOffset(clampDragOffset(nextOffset, session));
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (session && session.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragSessionRef.current = null;
    setIsDragging(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDragOffset({ x: 0, y: 0 });
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
        ref={contentRef}
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="relative z-[80] w-[min(26rem,calc(100vw-2rem))] origin-[--radix-popover-content-transform-origin] rounded-xl border border-border/70 bg-popover/95 p-3 shadow-2xl shadow-black/30 backdrop-blur data-[state=open]:slide-in-from-left-1 data-[state=open]:zoom-in-90"
        data-testid="design-resume-ai-assistant-popover"
        style={{
          translate: `${dragOffset.x}px ${dragOffset.y}px`,
        }}
      >
        <div className="-left-1.5 absolute top-3 h-3 w-3 rotate-45 border-b border-l border-border/70 bg-popover/95" />
        <div className="mb-3 flex items-start justify-between gap-2">
          <div
            className={cn(
              "flex min-w-0 flex-1 cursor-grab touch-none select-none items-start gap-2 rounded-md px-1 py-0.5 text-left active:cursor-grabbing",
              isDragging && "cursor-grabbing bg-muted/30",
            )}
            data-testid="design-resume-ai-assistant-drag-handle"
            title="Drag AI assistant"
            onPointerDown={startDrag}
            onPointerMove={drag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          >
            <GripHorizontal
              aria-hidden="true"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-foreground">
                Ghostwriter: {label}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                Draft a focused replacement for this field.
              </div>
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
          <div
            className="mb-3 max-h-72 overflow-y-auto overscroll-contain pr-1"
            onWheelCapture={(event) => event.stopPropagation()}
            onTouchMoveCapture={(event) => event.stopPropagation()}
          >
            <AiAssistMessageList
              messages={messages}
              isStreaming={isGenerating}
              streamingMessageId={null}
              assistantLabel="Ghostwriter"
              renderAssistantActions={(message) => {
                const isPending = pendingSuggestion?.messageId === message.id;
                if (!message.suggestion && !isPending) return null;

                return (
                  <div className="space-y-2">
                    {message.suggestion ? (
                      <SuggestionPreview suggestion={message.suggestion} />
                    ) : null}
                    {isPending ? (
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
                    ) : null}
                  </div>
                );
              }}
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

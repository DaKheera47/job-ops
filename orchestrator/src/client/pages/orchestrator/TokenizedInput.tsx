import { X } from "lucide-react";
import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimateOut } from "@/components/AnimateOut";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TokenizedInputProps {
  id: string;
  values: string[];
  draft: string;
  parseInput: (input: string) => string[];
  onDraftChange: (value: string) => void;
  onValuesChange: (values: string[]) => void;
  placeholder: string;
  helperText: string;
  removeLabelPrefix: string;
  collapsedTextLimit?: number;
}

function mergeUnique(values: string[], nextValues: string[]): string[] {
  const seen = new Set(values.map((value) => value.toLowerCase()));
  const out = [...values];
  for (const value of nextValues) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export const TokenizedInput: React.FC<TokenizedInputProps> = ({
  id,
  values,
  draft,
  parseInput,
  onDraftChange,
  onValuesChange,
  placeholder,
  helperText,
  removeLabelPrefix,
  collapsedTextLimit = 3,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const tokensRef = useRef<HTMLDivElement | null>(null);
  const [tokensHeight, setTokensHeight] = useState(20);
  const [exitingValues, setExitingValues] = useState<Set<string>>(new Set());
  const valuesRef = useRef(values);

  const collapsedSummary = useMemo(() => {
    if (values.length === 0) return "";
    const visibleCount = Math.max(0, Math.floor(collapsedTextLimit));
    if (visibleCount === 0) return `and ${values.length} more`;

    const visibleValues = values.slice(0, visibleCount);
    const hiddenCount = values.length - visibleValues.length;
    if (hiddenCount <= 0) return visibleValues.join(", ");
    return `${visibleValues.join(", ")} and ${hiddenCount} more`;
  }, [collapsedTextLimit, values]);

  const addValues = (input: string) => {
    const parsed = parseInput(input);
    if (parsed.length === 0) return;
    onValuesChange(mergeUnique(values, parsed));
  };

  const removeValueWithAnimation = (value: string) => {
    setExitingValues((current) => {
      if (current.has(value)) return current;
      const next = new Set(current);
      next.add(value);
      return next;
    });
  };

  useEffect(() => {
    valuesRef.current = values;
    setExitingValues((current) => {
      const next = new Set<string>();
      for (const value of current) {
        if (values.includes(value)) next.add(value);
      }
      return next;
    });
  }, [values]);

  useLayoutEffect(() => {
    const node = tokensRef.current;
    if (!node) return;

    const updateHeight = () => {
      setTokensHeight(Math.max(20, node.scrollHeight));
    };

    updateHeight();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [values, isFocused]);

  return (
    <div className="space-y-3">
      <Input
        id={id}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addValues(draft);
            onDraftChange("");
            return;
          }
        }}
        onBlur={() => {
          setIsFocused(false);
          addValues(draft);
          onDraftChange("");
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          const parsed = parseInput(pasted);
          if (parsed.length > 1) {
            event.preventDefault();
            addValues(pasted);
          }
        }}
        placeholder={placeholder}
      />
      <p className="text-xs text-muted-foreground">{helperText}</p>
      {values.length > 0 ? (
        <div
          className={cn(
            "relative overflow-hidden transition-[height] ease-out",
          )}
          style={{ height: `${isFocused ? tokensHeight : 20}px` }}
        >
          <AnimateOut
            show={isFocused}
            enterClassName="translate-y-0 opacity-100 animate-in fade-in slide-in-from-top-1"
            exitClassName="pointer-events-none -translate-y-1 opacity-0 animate-out fade-out slide-out-to-top-1"
          >
            <div
              aria-hidden={!isFocused}
              className="absolute inset-x-0 top-0 flex flex-wrap gap-2 overflow-hidden transition-all ease-out"
              ref={tokensRef}
            >
              {values.map((value) => (
                <AnimateOut
                  key={value}
                  show={!exitingValues.has(value)}
                  enterClassName="animate-in fade-in zoom-in-95 slide-in-from-top-1"
                  exitClassName="pointer-events-none animate-out fade-out zoom-out-95 slide-out-to-top-1"
                  onExitComplete={() => {
                    const latestValues = valuesRef.current;
                    onValuesChange(
                      latestValues.filter((existing) => existing !== value),
                    );
                    setExitingValues((current) => {
                      if (!current.has(value)) return current;
                      const next = new Set(current);
                      next.delete(value);
                      return next;
                    });
                  }}
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full text-xs px-2 text-muted-foreground py-1 h-auto"
                    aria-label={`${removeLabelPrefix} ${value}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => removeValueWithAnimation(value)}
                  >
                    {value}
                    <X className="h-3 w-3" />
                  </Button>
                </AnimateOut>
              ))}
            </div>
          </AnimateOut>
          <AnimateOut
            show={!isFocused}
            enterClassName="translate-y-0 opacity-100 animate-in fade-in slide-in-from-bottom-1"
            exitClassName="pointer-events-none translate-y-1 opacity-0 animate-out fade-out slide-out-to-bottom-1"
          >
            <p
              aria-hidden={isFocused}
              className="absolute inset-x-0 top-0 text-xs text-muted-foreground transition-all ease-out"
            >
              Currently selected: {collapsedSummary}
            </p>
          </AnimateOut>
        </div>
      ) : null}
    </div>
  );
};

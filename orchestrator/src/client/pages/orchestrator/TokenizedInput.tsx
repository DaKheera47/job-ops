import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type React from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  const [tokensHeight, setTokensHeight] = useState(20);
  const [summaryHeight, setSummaryHeight] = useState(20);
  const updateHeights = useCallback(() => {
    if (tokensRef.current) {
      setTokensHeight(Math.max(20, tokensRef.current.scrollHeight));
    }
    if (summaryRef.current) {
      setSummaryHeight(Math.max(20, summaryRef.current.scrollHeight));
    }
  }, []);

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

  useLayoutEffect(() => {
    updateHeights();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateHeights);
    if (tokensRef.current) observer.observe(tokensRef.current);
    if (summaryRef.current) observer.observe(summaryRef.current);

    return () => observer.disconnect();
  }, [updateHeights]);

  useLayoutEffect(() => {
    updateHeights();
  });

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
          if (parsed.length > 0) {
            event.preventDefault();
            addValues(pasted);
            onDraftChange("");
          }
        }}
        placeholder={placeholder}
      />
      <p className="text-xs text-muted-foreground">{helperText}</p>
      {values.length > 0 ? (
        <motion.div
          className="relative overflow-hidden"
          animate={{ height: isFocused ? tokensHeight : summaryHeight }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <motion.div
            aria-hidden={!isFocused}
            ref={tokensRef}
            className="absolute inset-x-0 top-0 flex flex-wrap gap-2"
            animate={{
              opacity: isFocused ? 1 : 0,
              y: isFocused ? 0 : -4,
            }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{ pointerEvents: isFocused ? "auto" : "none" }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {values.map((value) => (
                <motion.div
                  key={value}
                  layout
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -4 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto rounded-full px-2 py-1 text-xs text-muted-foreground"
                    aria-label={`${removeLabelPrefix} ${value}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() =>
                      onValuesChange(
                        values.filter((existing) => existing !== value),
                      )
                    }
                  >
                    {value}
                    <X className="h-3 w-3" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          <motion.p
            aria-hidden={isFocused}
            ref={summaryRef}
            className="absolute inset-x-0 top-0 text-xs text-muted-foreground"
            animate={{
              opacity: isFocused ? 0 : 1,
              y: isFocused ? 4 : 0,
            }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{ pointerEvents: isFocused ? "none" : "auto" }}
          >
            Currently selected: {collapsedSummary}
          </motion.p>
        </motion.div>
      ) : null}
    </div>
  );
};

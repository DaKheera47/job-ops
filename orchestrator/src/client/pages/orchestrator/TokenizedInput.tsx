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
  disabled?: boolean;
}

const TOKEN_PILL_CLASS_NAME =
  "inline-flex items-center rounded-full border px-2 py-1 text-xs text-muted-foreground";

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
  collapsedTextLimit = 5,
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const tokensRef = useRef<HTMLDivElement | null>(null);
  const collapsedTokensRef = useRef<HTMLDivElement | null>(null);
  const [tokensHeight, setTokensHeight] = useState(20);
  const [collapsedTokensHeight, setCollapsedTokensHeight] = useState(20);
  const updateHeights = useCallback(() => {
    if (tokensRef.current) {
      setTokensHeight(Math.max(20, tokensRef.current.scrollHeight));
    }
    if (collapsedTokensRef.current) {
      setCollapsedTokensHeight(
        Math.max(20, collapsedTokensRef.current.scrollHeight),
      );
    }
  }, []);

  const collapsedPreview = useMemo(() => {
    const visibleCount = Math.max(0, Math.floor(collapsedTextLimit));
    const visibleValues = values.slice(0, visibleCount);
    const hiddenCount = Math.max(0, values.length - visibleValues.length);
    return { visibleValues, hiddenCount };
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
    if (collapsedTokensRef.current) {
      observer.observe(collapsedTokensRef.current);
    }

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
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">{helperText}</p>
      {values.length > 0 ? (
        <motion.div
          className="relative overflow-hidden"
          animate={{
            height: isFocused ? tokensHeight : collapsedTokensHeight,
          }}
          transition={{ duration: 0.16, ease: "easeOut" }}
        >
          <motion.div
            aria-hidden={!isFocused}
            ref={tokensRef}
            data-testid={`${id}-expanded-tokens`}
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
                    className={`h-auto ${TOKEN_PILL_CLASS_NAME}`}
                    aria-label={`${removeLabelPrefix} ${value}`}
                    disabled={disabled}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() =>
                      onValuesChange(
                        values.filter((existing) => existing !== value),
                      )
                    }
                  >
                    {value}
                    <X className="ml-1 h-3 w-3" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          <motion.div
            aria-hidden={isFocused}
            ref={collapsedTokensRef}
            data-testid={`${id}-collapsed-tokens`}
            className="absolute inset-x-0 top-0 flex flex-wrap gap-2"
            animate={{
              opacity: isFocused ? 0 : 1,
              y: isFocused ? 4 : 0,
            }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{ pointerEvents: "none" }}
          >
            {collapsedPreview.visibleValues.map((value) => (
              <span key={value} className={TOKEN_PILL_CLASS_NAME}>
                {value}
              </span>
            ))}
            {collapsedPreview.hiddenCount > 0 ? (
              <span className={TOKEN_PILL_CLASS_NAME}>
                +{collapsedPreview.hiddenCount} more
              </span>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </div>
  );
};

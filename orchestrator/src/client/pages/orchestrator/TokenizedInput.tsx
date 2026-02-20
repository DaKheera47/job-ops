import { X } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
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
        <div className="relative min-h-5">
          <div
            aria-hidden={!isFocused}
            className={cn(
              "flex flex-wrap gap-2 overflow-hidden transition-all duration-200 ease-out",
              isFocused
                ? "max-h-40 translate-y-0 opacity-100 animate-in fade-in slide-in-from-top-1"
                : "pointer-events-none absolute inset-0 max-h-0 -translate-y-1 opacity-0",
            )}
          >
            {values.map((value) => (
              <button
                type="button"
                key={value}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/20 px-3 py-1 text-sm transition-all duration-150 hover:border-primary/50 hover:bg-primary/40 hover:text-primary-foreground hover:shadow-sm"
                aria-label={`${removeLabelPrefix} ${value}`}
                onClick={() =>
                  onValuesChange(values.filter((existing) => existing !== value))
                }
              >
                {value}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
          <p
            aria-hidden={isFocused}
            className={cn(
              "text-xs text-muted-foreground transition-all duration-200 ease-out",
              isFocused
                ? "pointer-events-none absolute inset-0 translate-y-1 opacity-0"
                : "translate-y-0 opacity-100 animate-in fade-in slide-in-from-bottom-1",
            )}
          >
            Currently selected: {collapsedSummary}
          </p>
        </div>
      ) : null}
    </div>
  );
};

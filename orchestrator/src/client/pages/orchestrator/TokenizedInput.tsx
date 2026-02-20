import { X } from "lucide-react";
import type React from "react";
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
}) => {
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
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addValues(draft);
            onDraftChange("");
            return;
          }
        }}
        onBlur={() => {
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
      <div className="flex flex-wrap gap-2">
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
    </div>
  );
};

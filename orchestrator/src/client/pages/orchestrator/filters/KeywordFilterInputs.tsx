import { Minus, Plus, X } from "lucide-react";
import type React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { KeywordFilterInputsProps } from "./types";

type KeywordInputProps = {
  ariaLabel: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
};

const KeywordInput: React.FC<KeywordInputProps> = ({
  ariaLabel,
  placeholder,
  value,
  onChange,
  icon,
}) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
      {icon}
    </span>
    <Input
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-9 w-[200px] rounded-full pl-8 text-xs",
        value.trim() && "pr-8",
      )}
    />
    {value.trim() ? (
      <button
        type="button"
        aria-label={`Clear ${ariaLabel.toLowerCase()}`}
        onClick={() => onChange("")}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    ) : null}
  </div>
);

export const KeywordFilterInputs: React.FC<KeywordFilterInputsProps> = ({
  includeKeywords,
  onIncludeKeywordsChange,
  excludeKeywords,
  onExcludeKeywordsChange,
}) => (
  <>
    <KeywordInput
      ariaLabel="Include keywords"
      placeholder="Include: Winter 2027, Co-op"
      value={includeKeywords}
      onChange={onIncludeKeywordsChange}
      icon={<Plus className="h-3.5 w-3.5" />}
    />
    <KeywordInput
      ariaLabel="Exclude keywords"
      placeholder="Exclude: Senior, Etudiant"
      value={excludeKeywords}
      onChange={onExcludeKeywordsChange}
      icon={<Minus className="h-3.5 w-3.5" />}
    />
  </>
);

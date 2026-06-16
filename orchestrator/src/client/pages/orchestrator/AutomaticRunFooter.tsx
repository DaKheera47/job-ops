import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AutomaticRunFooterProps {
  discoveredMin: number;
  discoveredMax: number;
  resumeCount: number;
  isSaving: boolean;
  disabled: boolean;
  onRunSearch: () => void;
}

export function AutomaticRunFooter({
  discoveredMin,
  discoveredMax,
  resumeCount,
  isSaving,
  disabled,
  onRunSearch,
}: AutomaticRunFooterProps) {
  return (
    <div className="mt-3 flex shrink-0 items-center justify-between border-t border-border/60 bg-background pt-3">
      <div className="hidden text-sm text-muted-foreground md:block">
        Est: {discoveredMin}-{discoveredMax} jobs, ~{resumeCount} resumes
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          className="gap-2"
          disabled={disabled}
          onClick={onRunSearch}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Run search
        </Button>
      </div>
    </div>
  );
}

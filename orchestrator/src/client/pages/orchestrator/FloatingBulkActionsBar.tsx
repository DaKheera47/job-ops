import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FloatingBulkActionsBarProps {
  selectedCount: number;
  canMoveSelected: boolean;
  canSkipSelected: boolean;
  bulkActionInFlight: boolean;
  onMoveToReady: () => void;
  onSkipSelected: () => void;
  onClear: () => void;
}

export const FloatingBulkActionsBar: React.FC<FloatingBulkActionsBarProps> = ({
  selectedCount,
  canMoveSelected,
  canSkipSelected,
  bulkActionInFlight,
  onMoveToReady,
  onSkipSelected,
  onClear,
}) => {
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (selectedCount > 0) {
      setIsMounted(true);
      const enterTimer = window.setTimeout(() => setIsVisible(true), 10);
      return () => window.clearTimeout(enterTimer);
    }

    setIsVisible(false);
    const exitTimer = window.setTimeout(() => setIsMounted(false), 180);
    return () => window.clearTimeout(exitTimer);
  }, [selectedCount]);

  if (!isMounted) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/95 px-3 py-2 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/85",
          "transition-all duration-200 ease-out",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        <div className="text-xs text-muted-foreground tabular-nums">
          {selectedCount} selected
        </div>
        {canMoveSelected && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={bulkActionInFlight}
            onClick={onMoveToReady}
          >
            Move to Ready
          </Button>
        )}
        {canSkipSelected && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={bulkActionInFlight}
            onClick={onSkipSelected}
          >
            Skip selected
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={bulkActionInFlight}
        >
          Clear
        </Button>
      </div>
    </div>
  );
};

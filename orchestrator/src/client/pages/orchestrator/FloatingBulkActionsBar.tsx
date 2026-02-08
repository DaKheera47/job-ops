import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FloatingBulkActionsBarProps {
  selectedCount: number;
  canMoveSelected: boolean;
  canSkipSelected: boolean;
  canRescoreSelected: boolean;
  bulkActionInFlight: boolean;
  onMoveToReady: () => void;
  onSkipSelected: () => void;
  onRescoreSelected: () => void;
  onClear: () => void;
}

export const FloatingBulkActionsBar: React.FC<FloatingBulkActionsBarProps> = ({
  selectedCount,
  canMoveSelected,
  canSkipSelected,
  canRescoreSelected,
  bulkActionInFlight,
  onMoveToReady,
  onSkipSelected,
  onRescoreSelected,
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex justify-center px-3 sm:px-4">
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-md flex-col items-stretch gap-2 rounded-xl border border-border/70 bg-card/95 px-3 py-2 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center",
          "transition-all duration-200 ease-out",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        )}
      >
        <div className="text-xs text-muted-foreground tabular-nums sm:mr-1">
          {selectedCount} selected
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {canMoveSelected && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
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
              className="w-full sm:w-auto"
              disabled={bulkActionInFlight}
              onClick={onSkipSelected}
            >
              Skip selected
            </Button>
          )}
          {canRescoreSelected && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={bulkActionInFlight}
              onClick={onRescoreSelected}
            >
              Recalculate match
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={onClear}
            disabled={bulkActionInFlight}
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
};

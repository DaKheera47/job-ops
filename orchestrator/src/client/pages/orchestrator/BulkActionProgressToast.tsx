import type { BulkJobAction } from "@shared/types";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface BulkActionProgressToastProps {
  action: BulkJobAction;
  progress: number;
  onDismiss: () => void;
}

const actionLabel: Record<BulkJobAction, string> = {
  move_to_ready: "Moving jobs to Ready...",
  skip: "Skipping selected jobs...",
  rescore: "Calculating match scores...",
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function BulkActionProgressToast({
  action,
  progress,
  onDismiss,
}: BulkActionProgressToastProps) {
  const roundedProgress = Math.round(clamp(progress, 0, 100));

  return (
    <div className="w-[320px] space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="tabular-nums text-lg font-semibold leading-none">
            {roundedProgress}%
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {actionLabel[action]}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onDismiss}
        >
          Hide
        </Button>
      </div>
      <Progress value={roundedProgress} className="h-1.5" />
    </div>
  );
}

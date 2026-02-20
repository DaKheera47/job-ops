import { Progress } from "@/components/ui/progress";
import { clampNumber } from "./utils";

interface JobActionProgressToastProps {
  completed: number;
  requested: number;
  succeeded: number;
  failed: number;
}

export function JobActionProgressToast({
  completed,
  requested,
  succeeded,
  failed,
}: JobActionProgressToastProps) {
  const safeRequested = Math.max(requested, 1);
  const safeCompleted = clampNumber(completed, 0, safeRequested);
  const progressValue = Math.round((safeCompleted / safeRequested) * 100);

  return (
    <div className="mt-2 w-full space-y-1.5">
      <Progress value={progressValue} className="h-1.5 w-full" />
      <p className="tabular-nums text-xs text-muted-foreground">
        {succeeded} succeeded, {failed} failed
      </p>
    </div>
  );
}

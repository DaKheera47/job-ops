import { Progress } from "@/components/ui/progress";

interface BulkActionProgressToastProps {
  completed: number;
  requested: number;
  succeeded: number;
  failed: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function BulkActionProgressToast({
  completed,
  requested,
  succeeded,
  failed,
}: BulkActionProgressToastProps) {
  const safeRequested = Math.max(requested, 1);
  const safeCompleted = clamp(completed, 0, safeRequested);
  const progressValue = Math.round((safeCompleted / safeRequested) * 100);

  return (
    <div className="mt-2 space-y-1.5">
      <Progress value={progressValue} className="h-1.5" />
      <p className="tabular-nums text-xs text-muted-foreground">
        {succeeded} succeeded, {failed} failed
      </p>
    </div>
  );
}

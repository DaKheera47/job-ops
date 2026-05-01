import {
  useBatchApplyProgress,
  useCancelBatchApplyMutation,
} from "@client/hooks/queries/useLinkedInApply";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function BatchApplyProgress() {
  const progress = useBatchApplyProgress();
  const cancelMutation = useCancelBatchApplyMutation();

  if (!progress || (!progress.running && progress.totalJobs === 0)) {
    return null;
  }

  const applied = progress.results.filter((r) => r.status === "applied").length;
  const failed = progress.results.filter((r) => r.status === "failed").length;
  const manual = progress.results.filter((r) => r.status === "manual_required").length;
  const pending = progress.results.filter((r) => r.status === "pending").length;
  const pct = progress.totalJobs > 0
    ? Math.round(((progress.totalJobs - pending) / progress.totalJobs) * 100)
    : 0;

  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          {progress.running
            ? `Applying: job ${progress.currentIndex + 1} of ${progress.totalJobs}`
            : "Batch apply completed"}
        </div>
        {progress.running && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-rose-400"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            Cancel
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Summary */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        {applied > 0 && (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> {applied} applied
          </span>
        )}
        {failed > 0 && (
          <span className="flex items-center gap-1 text-rose-400">
            <XCircle className="h-3 w-3" /> {failed} failed
          </span>
        )}
        {manual > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertCircle className="h-3 w-3" /> {manual} manual
          </span>
        )}
        {progress.running && pending > 0 && (
          <span className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> {pending} pending
          </span>
        )}
      </div>

      {/* VNC link */}
      {progress.viewerUrl && progress.running && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() =>
            window.open(progress.viewerUrl, "_blank", "noopener,noreferrer")
          }
        >
          <ExternalLink className="h-3 w-3" />
          Open browser viewer
        </Button>
      )}

      {/* Job results list (compact) */}
      {progress.results.length > 0 && !progress.running && (
        <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
          {progress.results.map((r) => (
            <div
              key={r.jobId}
              className="flex items-center gap-2 py-0.5"
            >
              {r.status === "applied" && (
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              )}
              {r.status === "failed" && (
                <XCircle className="h-3 w-3 text-rose-400 shrink-0" />
              )}
              {r.status === "manual_required" && (
                <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
              )}
              <span className="truncate">
                {r.jobTitle} — {r.employer}
              </span>
              {r.error && (
                <span className="text-muted-foreground ml-auto shrink-0">
                  {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

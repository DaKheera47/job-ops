import {
  useCancelEasyApplyMutation,
  useLinkedInApplyProgress,
} from "@client/hooks/queries/useLinkedInApply";
import type { LinkedInApplyStep } from "@shared/types";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Hand,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STEP_CONFIG: Record<
  LinkedInApplyStep,
  { icon: React.ReactNode; color: string }
> = {
  idle: { icon: null, color: "text-muted-foreground" },
  opening_browser: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-sky-400",
  },
  navigating: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-sky-400",
  },
  detecting_easy_apply: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-sky-400",
  },
  filling_form: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-amber-400",
  },
  uploading_resume: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-amber-400",
  },
  waiting_for_review: {
    icon: <Hand className="h-4 w-4" />,
    color: "text-orange-400",
  },
  submitting: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-emerald-400",
  },
  verifying: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: "text-emerald-400",
  },
  completed: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "text-emerald-400",
  },
  failed: {
    icon: <XCircle className="h-4 w-4" />,
    color: "text-rose-400",
  },
  manual_required: {
    icon: <AlertCircle className="h-4 w-4" />,
    color: "text-amber-400",
  },
};

interface EasyApplyProgressProps {
  jobId: string;
}

export function EasyApplyProgress({ jobId }: EasyApplyProgressProps) {
  const progress = useLinkedInApplyProgress(jobId);
  const cancelMutation = useCancelEasyApplyMutation();

  if (!progress || progress.step === "idle") return null;

  const config = STEP_CONFIG[progress.step];
  const isTerminal =
    progress.step === "completed" ||
    progress.step === "failed" ||
    progress.step === "manual_required";
  const needsInput = progress.needsHumanInput;

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        progress.step === "completed"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : progress.step === "failed"
            ? "border-rose-500/30 bg-rose-500/5"
            : needsInput
              ? "border-orange-500/30 bg-orange-500/5"
              : "border-sky-500/30 bg-sky-500/5"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={config.color}>{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${config.color}`}>{progress.message}</p>
          {progress.detail && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {progress.detail}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        {progress.viewerUrl && !isTerminal && (
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

        {progress.step === "manual_required" && progress.detail && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() =>
              window.open(progress.detail, "_blank", "noopener,noreferrer")
            }
          >
            <ExternalLink className="h-3 w-3" />
            Open job listing
          </Button>
        )}

        {!isTerminal && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-rose-400 hover:text-rose-300"
            onClick={() => cancelMutation.mutate(jobId)}
            disabled={cancelMutation.isPending}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

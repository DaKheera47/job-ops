import {
  useEasyApplyMutation,
  useLinkedInSessionStatus,
} from "@client/hooks/queries/useLinkedInApply";
import type { Job } from "@shared/types";
import { ExternalLink, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface AutoApplyButtonProps {
  job: Job;
  onApplyStarted?: () => void;
}

export function AutoApplyButton({ job, onApplyStarted }: AutoApplyButtonProps) {
  const { data: session } = useLinkedInSessionStatus();
  const easyApplyMutation = useEasyApplyMutation();

  const isLinkedIn = job.source === "linkedin";
  const isReady = job.status === "ready";
  const isConnected = session?.authenticated ?? false;

  if (!isLinkedIn || !isReady) return null;

  const handleAutoApply = () => {
    easyApplyMutation.mutate(
      { jobId: job.id, autoSubmit: false },
      {
        onSuccess: (data) => {
          toast.info("Auto-apply started — watch the browser viewer window", {
            duration: 5000,
          });
          onApplyStarted?.();
        },
        onError: (err) => {
          toast.error(
            err instanceof Error
              ? err.message
              : "Failed to start auto-apply",
          );
        },
      },
    );
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button variant="outline" size="sm" disabled className="gap-2">
          <Zap className="h-4 w-4" />
          Auto Apply
        </Button>
        <span className="text-xs text-muted-foreground">
          Connect LinkedIn above to enable auto-apply
        </span>
      </div>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      className="gap-2 bg-[#0a66c2] hover:bg-[#004182] text-white"
      onClick={handleAutoApply}
      disabled={easyApplyMutation.isPending}
    >
      {easyApplyMutation.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting...
        </>
      ) : (
        <>
          <Zap className="h-4 w-4" />
          Auto Apply via LinkedIn
        </>
      )}
    </Button>
  );
}

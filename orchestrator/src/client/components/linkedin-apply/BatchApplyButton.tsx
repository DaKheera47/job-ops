import {
  useBatchApplyMutation,
  useLinkedInSessionStatus,
} from "@client/hooks/queries/useLinkedInApply";
import { Loader2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface BatchApplyButtonProps {
  linkedInReadyCount: number;
  selectedJobIds?: string[];
}

export function BatchApplyButton({
  linkedInReadyCount,
  selectedJobIds,
}: BatchApplyButtonProps) {
  const { data: session } = useLinkedInSessionStatus();
  const batchMutation = useBatchApplyMutation();
  const [confirming, setConfirming] = useState(false);

  const isConnected = session?.authenticated ?? false;
  const count = selectedJobIds?.length ?? linkedInReadyCount;
  const estimateMinutes = Math.ceil((count * 70) / 60);

  if (count === 0) return null;

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 5000);
      return;
    }

    setConfirming(false);
    const input = selectedJobIds
      ? { jobIds: selectedJobIds }
      : { filter: "all_ready_linkedin" as const };

    batchMutation.mutate(input, {
      onSuccess: (data) => {
        toast.info(
          `Batch apply started for ${data.totalJobs} jobs. Watch the browser viewer.`,
          { duration: 5000 },
        );
      },
      onError: (err) => {
        toast.error(
          err instanceof Error ? err.message : "Failed to start batch apply",
        );
      },
    });
  };

  if (!isConnected) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Zap className="h-4 w-4" />
        Apply All ({count}) — Connect LinkedIn first
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      className={`gap-2 ${
        confirming
          ? "bg-orange-600 hover:bg-orange-500 text-white"
          : "bg-[#0a66c2] hover:bg-[#004182] text-white"
      }`}
      onClick={handleClick}
      disabled={batchMutation.isPending}
    >
      {batchMutation.isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting...
        </>
      ) : confirming ? (
        <>
          <Zap className="h-4 w-4" />
          Confirm: Apply to {count} jobs (~{estimateMinutes}m)?
        </>
      ) : (
        <>
          <Zap className="h-4 w-4" />
          Auto Apply All ({count})
        </>
      )}
    </Button>
  );
}

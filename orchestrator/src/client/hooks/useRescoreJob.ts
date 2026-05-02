import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useRescoreJobMutation } from "@/client/hooks/queries/useJobMutations";
import { showErrorToast } from "@/client/lib/error-toast";
import { trackProductEvent } from "@/lib/analytics";

export function useRescoreJob(onJobUpdated: () => void | Promise<void>) {
  const [isRescoring, setIsRescoring] = useState(false);
  const rescoreMutation = useRescoreJobMutation();

  const rescoreJob = useCallback(
    async (jobId?: string | null) => {
      if (!jobId) return;

      try {
        setIsRescoring(true);
        await rescoreMutation.mutateAsync(jobId);
        trackProductEvent("jobs_job_action_completed", {
          action: "rescore",
          result: "success",
        });
        toast.success("Match recalculated");
        await onJobUpdated();
      } catch (error) {
        trackProductEvent("jobs_job_action_completed", {
          action: "rescore",
          result: "error",
        });
        showErrorToast(error, "Failed to recalculate match");
      } finally {
        setIsRescoring(false);
      }
    },
    [onJobUpdated, rescoreMutation],
  );

  return { isRescoring, rescoreJob };
}

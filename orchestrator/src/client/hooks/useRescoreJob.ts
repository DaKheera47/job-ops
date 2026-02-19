import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useRescoreJobMutation } from "@/client/hooks/queries/useJobMutations";

export function useRescoreJob(onJobUpdated: () => void | Promise<void>) {
  const [isRescoring, setIsRescoring] = useState(false);
  const rescoreMutation = useRescoreJobMutation();

  const rescoreJob = useCallback(
    async (jobId?: string | null) => {
      if (!jobId) return;

      try {
        setIsRescoring(true);
        await rescoreMutation.mutateAsync(jobId);
        toast.success("Match recalculated");
        await onJobUpdated();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to recalculate match";
        toast.error(message);
      } finally {
        setIsRescoring(false);
      }
    },
    [onJobUpdated, rescoreMutation],
  );

  return { isRescoring, rescoreJob };
}

import { useCallback, useState } from "react";
import { toast } from "sonner";

import * as api from "../api";

export function useRescoreJob(onJobUpdated: () => void | Promise<void>) {
  const [isRescoring, setIsRescoring] = useState(false);

  const rescoreJob = useCallback(
    async (jobId?: string | null) => {
      if (!jobId) return;

      try {
        setIsRescoring(true);
        await api.rescoreJob(jobId);
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
    [onJobUpdated],
  );

  return { isRescoring, rescoreJob };
}

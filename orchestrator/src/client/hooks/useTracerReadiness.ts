import type { TracerReadinessResponse } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient as appQueryClient } from "@/client/lib/queryClient";
import { queryKeys } from "@/client/lib/queryKeys";
import * as api from "../api";

export function useTracerReadiness() {
  const queryClient = useQueryClient();
  const {
    data: readiness = null,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<TracerReadinessResponse | null>({
    queryKey: queryKeys.tracer.readiness(false),
    queryFn: () => api.getTracerReadiness({ force: false }),
  });

  const refreshReadiness = async (force = true) => {
    if (!force) {
      const result = await refetch();
      if (result.error) throw result.error;
      return result.data ?? null;
    }

    const data = await api.getTracerReadiness({ force: true });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.tracer.readiness(false),
    });
    return data;
  };

  return {
    readiness,
    error: error ?? null,
    isLoading: isLoading && !readiness,
    isChecking: isFetching,
    refreshReadiness,
  };
}

/** @internal For testing only */
export function _resetTracerReadinessCache() {
  appQueryClient.removeQueries({ queryKey: queryKeys.tracer.all });
}

import type { ResumeProfile } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { queryClient as appQueryClient } from "@/client/lib/queryClient";
import { queryKeys } from "@/client/lib/queryKeys";
import * as api from "../api";

/**
 * Hook to get the full profile data from base.json.
 * Caches the result to avoid re-fetching.
 */
export function useProfile() {
  const {
    data: profile = null,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<ResumeProfile | null>({
    queryKey: queryKeys.profile.current(),
    queryFn: api.getProfile,
  });

  const refreshProfile = async () => {
    const result = await refetch();
    if (result.error) throw result.error;
    return result.data ?? null;
  };

  return {
    profile,
    error: error ?? null,
    isLoading: isLoading || (!!isFetching && !profile && !error),
    personName: profile?.basics?.name || "Resume",
    refreshProfile,
  };
}

/** @internal For testing only */
export function _resetProfileCache() {
  appQueryClient.removeQueries({ queryKey: queryKeys.profile.all });
}

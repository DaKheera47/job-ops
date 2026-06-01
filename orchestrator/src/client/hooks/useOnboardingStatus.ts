import type { OnboardingStatusResponse } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import * as api from "@/client/api";
import { queryClient as appQueryClient } from "@/client/lib/queryClient";
import { queryKeys } from "@/client/lib/queryKeys";

export function useOnboardingStatus() {
  const query = useQuery<OnboardingStatusResponse>({
    queryKey: queryKeys.onboarding.status(),
    queryFn: api.getOnboardingStatus,
    retry: 1,
  });

  return {
    status: query.data ?? null,
    complete: query.data?.complete ?? false,
    nextRequirementId: query.data?.nextRequirementId ?? null,
    requirements: query.data?.requirements ?? [],
    checking: query.isLoading || (!!query.isFetching && !query.data),
    error: query.error ?? null,
    refetch: query.refetch,
  };
}

export function _resetOnboardingStatusCache() {
  appQueryClient.removeQueries({ queryKey: queryKeys.onboarding.all });
}

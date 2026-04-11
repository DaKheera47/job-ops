import type {
  DesignResumeDocument,
  DesignResumeStatusResponse,
} from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { queryClient as appQueryClient } from "@/client/lib/queryClient";
import { queryKeys } from "@/client/lib/queryKeys";
import * as api from "../api";

export function useDesignResume() {
  const documentQuery = useQuery<DesignResumeDocument | null>({
    queryKey: queryKeys.designResume.current(),
    queryFn: api.getDesignResume,
    retry: false,
  });

  const statusQuery = useQuery<DesignResumeStatusResponse>({
    queryKey: queryKeys.designResume.status(),
    queryFn: api.getDesignResumeStatus,
  });

  return {
    document: documentQuery.data ?? null,
    status: statusQuery.data ?? null,
    error: documentQuery.error ?? null,
    isLoading: documentQuery.isLoading || statusQuery.isLoading,
    refresh: async () => {
      await Promise.all([documentQuery.refetch(), statusQuery.refetch()]);
    },
  };
}

export function _resetDesignResumeCache() {
  appQueryClient.removeQueries({ queryKey: queryKeys.designResume.all });
}

import * as api from "@client/api";
import type { DemoInfoResponse } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/client/lib/queryKeys";

export function useDemoInfo(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const { data } = useQuery<DemoInfoResponse | null>({
    queryKey: queryKeys.demo.info(),
    enabled,
    queryFn: async () => {
      try {
        return await api.getDemoInfo();
      } catch {
        return null;
      }
    },
  });
  return data ?? null;
}

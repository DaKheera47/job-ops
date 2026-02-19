import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import * as api from "@/client/api";
import { invalidateSettingsData } from "./invalidate";

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateSettingsInput) => api.updateSettings(payload),
    onSuccess: async () => {
      await invalidateSettingsData(queryClient);
    },
  });
}

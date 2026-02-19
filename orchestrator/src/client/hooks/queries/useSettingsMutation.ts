import * as api from "@client/api";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

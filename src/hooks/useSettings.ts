import { useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { type UserSettings } from "@/lib/schemas";
import { queryKeys } from "@/lib/queryKeys";

export function useSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.user,
    queryFn: () => ipc.settings.getUserSettings(),
  });

  const envVarsQuery = useQuery({
    queryKey: queryKeys.settings.envVars,
    queryFn: () => ipc.misc.getEnvVars(),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Partial<UserSettings>) => {
      return ipc.settings.setUserSettings(newSettings);
    },
    onSuccess: (updatedSettings) => {
      queryClient.setQueryData(queryKeys.settings.user, updatedSettings);
    },
    meta: { showErrorToast: true },
  });
  const updateSettingsMutationRef = useRef(updateSettingsMutation);
  updateSettingsMutationRef.current = updateSettingsMutation;

  const updateSettings = useCallback(
    async (newSettings: Partial<UserSettings>) => {
      return updateSettingsMutationRef.current.mutateAsync(newSettings);
    },
    [],
  );

  const refreshSettings = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.settings.all,
    });
    return (
      queryClient.getQueryData<UserSettings>(queryKeys.settings.user) ?? null
    );
  }, [queryClient]);

  const loading = settingsQuery.isLoading || envVarsQuery.isLoading;
  const error = settingsQuery.error || envVarsQuery.error || null;

  return {
    settings: settingsQuery.data ?? null,
    envVars: envVarsQuery.data ?? {},
    loading,
    error,
    updateSettings,
    refreshSettings,
  };
}

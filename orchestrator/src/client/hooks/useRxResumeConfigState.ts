import {
  getRxResumeBaseResumeSelection,
  getStoredRxResumeCredentialAvailability,
  type RxResumeSettingsLike,
} from "@client/lib/rxresume-config";
import type { RxResumeMode } from "@shared/types.js";
import { useCallback, useMemo, useState } from "react";

const EMPTY_IDS_BY_MODE: Record<RxResumeMode, string | null> = {
  v4: null,
  v5: null,
};

export function useRxResumeConfigState(settings: RxResumeSettingsLike) {
  const storedRxResume = useMemo(
    () => getStoredRxResumeCredentialAvailability(settings),
    [settings],
  );
  const [baseResumeIdsByMode, setBaseResumeIdsByMode] =
    useState<Record<RxResumeMode, string | null>>(EMPTY_IDS_BY_MODE);

  const syncBaseResumeIdsForMode = useCallback(
    (mode: RxResumeMode) => {
      const { idsByMode, selectedId } = getRxResumeBaseResumeSelection(
        settings,
        mode,
      );
      setBaseResumeIdsByMode(idsByMode);
      return selectedId;
    },
    [settings],
  );

  const getBaseResumeIdForMode = useCallback(
    (mode: RxResumeMode) => baseResumeIdsByMode[mode] ?? null,
    [baseResumeIdsByMode],
  );

  const setBaseResumeIdForMode = useCallback(
    (mode: RxResumeMode, value: string | null) => {
      setBaseResumeIdsByMode((prev) =>
        prev[mode] === value ? prev : { ...prev, [mode]: value },
      );
    },
    [],
  );

  return {
    storedRxResume,
    baseResumeIdsByMode,
    syncBaseResumeIdsForMode,
    getBaseResumeIdForMode,
    setBaseResumeIdForMode,
  };
}

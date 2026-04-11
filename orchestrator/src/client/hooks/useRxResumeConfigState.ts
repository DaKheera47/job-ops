import {
  getRxResumeBaseResumeSelection,
  getStoredRxResumeCredentialAvailability,
  type RxResumeSettingsLike,
} from "@client/lib/rxresume-config";
import { useCallback, useMemo, useState } from "react";

export function useRxResumeConfigState(settings: RxResumeSettingsLike) {
  const storedRxResume = useMemo(
    () => getStoredRxResumeCredentialAvailability(settings),
    [settings],
  );
  const [baseResumeId, setBaseResumeId] = useState<string | null>(null);

  const syncBaseResumeId = useCallback(() => {
    const { selectedId } = getRxResumeBaseResumeSelection(settings);
    setBaseResumeId(selectedId);
    return selectedId;
  }, [settings]);

  const getBaseResumeId = useCallback(() => baseResumeId, [baseResumeId]);

  return {
    storedRxResume,
    baseResumeId,
    syncBaseResumeId,
    getBaseResumeId,
    setBaseResumeId,
  };
}

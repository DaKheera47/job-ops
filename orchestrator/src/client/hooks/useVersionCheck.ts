import { useEffect, useState } from "react";
import { checkForUpdate, parseVersion } from "../lib/version";

declare const __APP_VERSION__: string;

interface VersionState {
  version: string;
  updateAvailable: boolean;
  latestVersion: string | null;
}

export function useVersionCheck(): VersionState {
  const [state, setState] = useState<VersionState>(() => ({
    version:
      typeof __APP_VERSION__ !== "undefined"
        ? parseVersion(__APP_VERSION__ as string)
        : "unknown",
    updateAvailable: false,
    latestVersion: null,
  }));

  useEffect(() => {
    let cancelled = false;

    checkForUpdate().then((result) => {
      if (cancelled) return;
      setState({
        version: result.currentVersion,
        updateAvailable: result.updateAvailable,
        latestVersion: result.latestVersion,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

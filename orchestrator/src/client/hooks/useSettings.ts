import { useEffect, useState } from "react";
import type { AppSettings } from "../../shared/types";
import * as api from "../api";

let settingsCache: AppSettings | null = null;
let settingsError: Error | null = null;
const subscribers: Set<
  (settings: AppSettings | null, error: Error | null) => void
> = new Set();
let isFetching = false;

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(settingsCache);
  const [error, setError] = useState<Error | null>(settingsError);

  useEffect(() => {
    if (settingsCache) {
      setSettings(settingsCache);
    }
    if (settingsError) {
      setError(settingsError);
    }

    const handleUpdate = (
      newSettings: AppSettings | null,
      newError: Error | null,
    ) => {
      setSettings(newSettings);
      setError(newError);
    };

    subscribers.add(handleUpdate);

    if (!settingsCache && !isFetching) {
      isFetching = true;
      settingsError = null;
      api
        .getSettings()
        .then((data) => {
          settingsCache = data;
          settingsError = null;
          subscribers.forEach((sub) => {
            sub(data, null);
          });
        })
        .catch((err) => {
          settingsError = err instanceof Error ? err : new Error(String(err));
          subscribers.forEach((sub) => {
            sub(settingsCache, settingsError);
          });
        })
        .finally(() => {
          isFetching = false;
        });
    }

    return () => {
      subscribers.delete(handleUpdate);
    };
  }, []);

  const refreshSettings = async () => {
    isFetching = true;
    settingsError = null;
    subscribers.forEach((sub) => {
      sub(settingsCache, null);
    });

    try {
      const data = await api.getSettings();
      settingsCache = data;
      settingsError = null;
      subscribers.forEach((sub) => {
        sub(data, null);
      });
      return data;
    } catch (err) {
      settingsError = err instanceof Error ? err : new Error(String(err));
      subscribers.forEach((sub) => {
        sub(settingsCache, settingsError);
      });
      throw settingsError;
    } finally {
      isFetching = false;
    }
  };

  return {
    settings,
    error,
    isLoading: !settings && isFetching && !error,
    showSponsorInfo: settings?.showSponsorInfo ?? true,
    refreshSettings,
  };
}

/** @internal For testing only */
export function _resetSettingsCache() {
  settingsCache = null;
  settingsError = null;
  isFetching = false;
  subscribers.clear();
}

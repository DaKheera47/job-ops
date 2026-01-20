import { useEffect, useState } from 'react';
import type { AppSettings } from '../../shared/types';
import * as api from '../api';

let settingsCache: AppSettings | null = null;
let subscribers: Set<(settings: AppSettings) => void> = new Set();
let isFetching = false;

export function useSettings() {
    const [settings, setSettings] = useState<AppSettings | null>(settingsCache);

    useEffect(() => {
        if (settingsCache) {
            setSettings(settingsCache);
        }

        const handleUpdate = (newSettings: AppSettings) => {
            setSettings(newSettings);
        };

        subscribers.add(handleUpdate);

        if (!settingsCache && !isFetching) {
            isFetching = true;
            api.getSettings()
                .then((data) => {
                    settingsCache = data;
                    subscribers.forEach(sub => sub(data));
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
        try {
            const data = await api.getSettings();
            settingsCache = data;
            subscribers.forEach(sub => sub(data));
            return data;
        } finally {
            isFetching = false;
        }
    };

    return {
        settings,
        isLoading: !settings && isFetching,
        showSponsorInfo: settings?.showSponsorInfo ?? true,
        refreshSettings,
    };
}

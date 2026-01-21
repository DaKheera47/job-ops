import { useEffect, useState } from 'react';
import * as api from '../api';
import type { ResumeProfile } from '../../shared/types';

let profileCache: ResumeProfile | null = null;
let profileError: Error | null = null;
let subscribers: Set<(profile: ResumeProfile | null, error: Error | null) => void> = new Set();
let isFetching = false;

/**
 * Hook to get the full profile data from base.json.
 * Caches the result to avoid re-fetching.
 */
export function useProfile() {
    const [profile, setProfile] = useState<ResumeProfile | null>(profileCache);
    const [error, setError] = useState<Error | null>(profileError);

    useEffect(() => {
        if (profileCache) {
            setProfile(profileCache);
        }
        if (profileError) {
            setError(profileError);
        }

        const handleUpdate = (newProfile: ResumeProfile | null, newError: Error | null) => {
            setProfile(newProfile);
            setError(newError);
        };

        subscribers.add(handleUpdate);

        if (!profileCache && !isFetching) {
            isFetching = true;
            profileError = null;
            api.getProfile()
                .then((data) => {
                    profileCache = data;
                    profileError = null;
                    subscribers.forEach(sub => sub(data, null));
                })
                .catch((err) => {
                    profileError = err instanceof Error ? err : new Error(String(err));
                    subscribers.forEach(sub => sub(profileCache, profileError));
                })
                .finally(() => {
                    isFetching = false;
                });
        }

        return () => {
            subscribers.delete(handleUpdate);
        };
    }, []);

    const refreshProfile = async () => {
        isFetching = true;
        profileError = null;
        subscribers.forEach(sub => sub(profileCache, null));

        try {
            const data = await api.getProfile();
            profileCache = data;
            profileError = null;
            subscribers.forEach(sub => sub(data, null));
            return data;
        } catch (err) {
            profileError = err instanceof Error ? err : new Error(String(err));
            subscribers.forEach(sub => sub(profileCache, profileError));
            throw profileError;
        } finally {
            isFetching = false;
        }
    };

    return {
        profile,
        error,
        isLoading: !profile && isFetching && !error,
        personName: profile?.basics?.name || 'Resume',
        refreshProfile,
    };
}

/** @internal For testing only */
export function _resetProfileCache() {
    profileCache = null;
    profileError = null;
    isFetching = false;
    subscribers.clear();
}

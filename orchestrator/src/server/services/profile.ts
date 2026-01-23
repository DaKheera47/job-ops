/**
 * Profile service - fetches resume data from RxResume v4 API.
 * 
 * The rxresumeBaseResumeId setting is REQUIRED for the app to function.
 * There is no local file fallback.
 */

import { getSetting } from '../repositories/settings.js';
import { getResume, RxResumeCredentialsError } from './rxresume-v4.js';

let cachedProfile: any = null;
let cachedResumeId: string | null = null;

/**
 * Get the base resume profile from RxResume v4 API.
 * 
 * Requires rxresumeBaseResumeId to be configured in settings.
 * Results are cached until clearProfileCache() is called.
 * 
 * @param forceRefresh Force reload from API.
 * @throws Error if rxresumeBaseResumeId is not configured or API call fails.
 */
export async function getProfile(forceRefresh = false): Promise<any> {
    const rxresumeBaseResumeId = await getSetting('rxresumeBaseResumeId');

    if (!rxresumeBaseResumeId) {
        throw new Error(
            'Base resume not configured. Please select a base resume from your RxResume account in Settings.'
        );
    }

    // Return cached profile if valid
    if (cachedProfile && cachedResumeId === rxresumeBaseResumeId && !forceRefresh) {
        return cachedProfile;
    }

    try {
        console.log(`📋 Fetching profile from RxResume v4 API (resume: ${rxresumeBaseResumeId})...`);
        const resume = await getResume(rxresumeBaseResumeId);

        if (!resume.data || typeof resume.data !== 'object') {
            throw new Error('Resume data is empty or invalid');
        }

        cachedProfile = resume.data;
        cachedResumeId = rxresumeBaseResumeId;
        console.log(`✅ Profile loaded from RxResume v4 API`);
        return cachedProfile;
    } catch (error) {
        if (error instanceof RxResumeCredentialsError) {
            throw new Error('RxResume credentials not configured. Set RXRESUME_EMAIL and RXRESUME_PASSWORD in settings.');
        }
        console.error(`❌ Failed to load profile from RxResume v4 API:`, error);
        throw error;
    }
}

/**
 * Get the person's name from the profile.
 */
export async function getPersonName(): Promise<string> {
    const profile = await getProfile();
    return profile?.basics?.name || 'Resume';
}

/**
 * Clear the profile cache.
 */
export function clearProfileCache(): void {
    cachedProfile = null;
    cachedResumeId = null;
}

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PROFILE_PATH = process.env.RESUME_PROFILE_PATH || join(__dirname, '../../../../resume-generator/base.json');

let cachedProfile: any = null;
let cachedProfilePath: string | null = null;

/**
 * Get the base resume profile from base.json.
 * Caches the result since it doesn't change often.
 * @param profilePath Optional absolute path to profile JSON. Defaults to base.json.
 * @param forceRefresh Force reload from disk.
 */
export async function getProfile(profilePath?: string, forceRefresh = false): Promise<any> {
    const targetPath = profilePath || DEFAULT_PROFILE_PATH;

    if (cachedProfile && cachedProfilePath === targetPath && !forceRefresh) {
        return cachedProfile;
    }

    try {
        const content = await readFile(targetPath, 'utf-8');
        cachedProfile = JSON.parse(content);
        cachedProfilePath = targetPath;
        return cachedProfile;
    } catch (error) {
        console.error(`❌ Failed to load profile from ${targetPath}:`, error);
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
}

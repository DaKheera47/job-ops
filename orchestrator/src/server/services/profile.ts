import { logger } from "@infra/logger";
import type { ResumeProfile } from "@shared/types";
import {
  getCanonicalResumeAccess,
  getCanonicalResumeSelection,
} from "./platform/resumeStudio";
import { RxResumeAuthConfigError } from "./rxresume";

let cachedProfile: ResumeProfile | null = null;
let cachedResumeId: string | null = null;

/**
 * Get the canonical resume profile through the platform boundary.
 *
 * Results are cached until clearProfileCache() is called, but ordinary reads
 * still verify that the canonical resume identity has not changed.
 *
 * @param forceRefresh Force reload from API.
 * @throws Error if a canonical resume is not configured or the upstream read fails.
 */
export async function getProfile(forceRefresh = false): Promise<ResumeProfile> {
  try {
    const selection = await getCanonicalResumeSelection({
      bootstrapFromLegacy: true,
    });

    if (
      cachedProfile &&
      cachedResumeId === selection.canonicalResume.rxresumeResumeId &&
      !forceRefresh
    ) {
      return cachedProfile;
    }

    const access = await getCanonicalResumeAccess({
      profileId: selection.profile.id,
      workspaceId: selection.workspace.id,
      bootstrapFromLegacy: false,
    });

    logger.info("Fetching profile from canonical resume boundary", {
      profileId: access.profile.id,
      resumeId: access.canonicalResume.rxresumeResumeId,
    });

    if (!access.resume.data || typeof access.resume.data !== "object") {
      throw new Error("Resume data is empty or invalid");
    }

    cachedProfile = access.resume.data as unknown as ResumeProfile;
    cachedResumeId = access.canonicalResume.rxresumeResumeId;
    logger.info("Profile loaded from canonical resume boundary", {
      profileId: access.profile.id,
      resumeId: access.canonicalResume.rxresumeResumeId,
    });
    return cachedProfile;
  } catch (error) {
    if (error instanceof RxResumeAuthConfigError) {
      throw new Error(error.message);
    }
    logger.error("Failed to load profile from canonical resume boundary", {
      resumeId: cachedResumeId,
      error,
    });
    throw error;
  }
}

/**
 * Get the person's name from the profile.
 */
export async function getPersonName(): Promise<string> {
  const profile = await getProfile();
  return profile?.basics?.name || "Resume";
}

/**
 * Clear the profile cache.
 */
export function clearProfileCache(): void {
  cachedProfile = null;
  cachedResumeId = null;
}

import { logger } from "@infra/logger";
import type { ResumeProfile } from "@shared/types";
import { getResume, RxResumeAuthConfigError } from "./rxresume";
import { getConfiguredRxResumeBaseResumeId } from "./rxresume/baseResumeId";

let cachedProfile: ResumeProfile | null = null;
let cachedResumeId: string | null = null;

/**
 * Get the base resume profile from RxResume.
 *
 * Requires rxresumeBaseResumeId to be configured in settings.
 * Results are cached until clearProfileCache() is called.
 *
 * @param forceRefresh Force reload from API.
 * @throws Error if rxresumeBaseResumeId is not configured or API call fails.
 */
export async function getProfile(forceRefresh = false): Promise<ResumeProfile> {
  const { resumeId: rxresumeBaseResumeId } =
    await getConfiguredRxResumeBaseResumeId();

  if (!rxresumeBaseResumeId) {
    throw new Error(
      "Base resume not configured. Please select a base resume from your RxResume account in Settings.",
    );
  }

  // Return cached profile if valid
  if (
    cachedProfile &&
    cachedResumeId === rxresumeBaseResumeId &&
    !forceRefresh
  ) {
    return cachedProfile;
  }

  try {
    logger.info("Fetching profile from Reactive Resume", {
      resumeId: rxresumeBaseResumeId,
    });
    const resume = await getResume(rxresumeBaseResumeId);

    if (!resume.data || typeof resume.data !== "object") {
      throw new Error("Resume data is empty or invalid");
    }

    cachedProfile = resume.data as unknown as ResumeProfile;
    cachedResumeId = rxresumeBaseResumeId;
    logger.info("Profile loaded from Reactive Resume", {
      resumeId: rxresumeBaseResumeId,
    });
    return cachedProfile;
  } catch (error) {
    if (error instanceof RxResumeAuthConfigError) {
      throw new Error(error.message);
    }
    logger.error("Failed to load profile from Reactive Resume", {
      resumeId: rxresumeBaseResumeId,
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

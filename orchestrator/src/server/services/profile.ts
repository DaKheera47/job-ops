import { logger } from "@infra/logger";
import { getTenantId } from "@infra/request-context";
import { getActiveTenantId } from "@server/tenancy/context";
import type { ResumeProfile } from "@shared/types";
import {
  designResumeToProfile,
  isLegacyDesignResumeError,
} from "./design-resume";
import { getResume, RxResumeAuthConfigError } from "./rxresume";
import { getConfiguredRxResumeBaseResumeId } from "./rxresume/baseResumeId";

type TenantProfileCache = {
  profile: ResumeProfile | null;
  resumeId: string | null;
  localProfile: ResumeProfile | null;
};

const profileCacheByTenant = new Map<string, TenantProfileCache>();

function getTenantProfileCache(): TenantProfileCache {
  const tenantId = getActiveTenantId();
  let cache = profileCacheByTenant.get(tenantId);
  if (!cache) {
    cache = {
      profile: null,
      resumeId: null,
      localProfile: null,
    };
    profileCacheByTenant.set(tenantId, cache);
  }
  return cache;
}

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
  const cache = getTenantProfileCache();

  if (cache.localProfile && !forceRefresh) {
    return cache.localProfile;
  }

  try {
    const localProfile = await designResumeToProfile();
    if (localProfile) {
      cache.localProfile = localProfile;
      return localProfile;
    }
  } catch (error) {
    if (!isLegacyDesignResumeError(error)) {
      throw error;
    }
    logger.warn(
      "Ignoring legacy local Design Resume while loading profile fallback",
      {
        error,
      },
    );
  }

  const { resumeId: rxresumeBaseResumeId } =
    await getConfiguredRxResumeBaseResumeId();

  if (!rxresumeBaseResumeId) {
    throw new Error(
      "Base resume not configured. Please select a base resume from your RxResume account in Settings.",
    );
  }

  // Return cached profile if valid
  if (
    cache.profile &&
    cache.resumeId === rxresumeBaseResumeId &&
    !forceRefresh
  ) {
    return cache.profile;
  }

  try {
    logger.info("Fetching profile from Reactive Resume", {
      resumeId: rxresumeBaseResumeId,
    });
    const resume = forceRefresh
      ? await getResume(rxresumeBaseResumeId, { forceRefresh: true })
      : await getResume(rxresumeBaseResumeId);

    if (!resume.data || typeof resume.data !== "object") {
      throw new Error("Resume data is empty or invalid");
    }

    cache.profile = resume.data as unknown as ResumeProfile;
    cache.resumeId = rxresumeBaseResumeId;
    logger.info("Profile loaded from Reactive Resume", {
      resumeId: rxresumeBaseResumeId,
    });
    return cache.profile;
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
  const tenantId = getTenantId();
  if (tenantId) {
    profileCacheByTenant.delete(tenantId);
    return;
  }
  profileCacheByTenant.clear();
}

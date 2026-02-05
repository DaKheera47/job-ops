import { logger } from "@infra/logger";
import { getProfile } from "../../services/profile";

export async function loadProfileStep(): Promise<Record<string, unknown>> {
  logger.info("Loading profile");
  return getProfile().catch((error) => {
    logger.warn(
      "Failed to load profile for scoring, using empty profile",
      error,
    );
    return {} as Record<string, unknown>;
  });
}

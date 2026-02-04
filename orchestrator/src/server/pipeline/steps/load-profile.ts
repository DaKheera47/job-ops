import { getProfile } from "../../services/profile";

export async function loadProfileStep(): Promise<Record<string, unknown>> {
  console.log("\n📋 Loading profile...");
  return getProfile().catch((error) => {
    console.warn(
      "⚠️ Failed to load profile for scoring, using empty profile:",
      error,
    );
    return {} as Record<string, unknown>;
  });
}

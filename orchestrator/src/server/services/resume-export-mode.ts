import { getSetting } from "@server/repositories/settings";

export type ResumeExportMode = "rxresume" | "latex";

export function normalizeResumeExportMode(
  value: string | null | undefined,
): ResumeExportMode {
  return value === "latex" ? "latex" : "rxresume";
}

export async function getConfiguredResumeExportMode(): Promise<ResumeExportMode> {
  const stored = await getSetting("resumeExportMode");
  return normalizeResumeExportMode(
    stored ?? process.env.RESUME_EXPORT_MODE ?? null,
  );
}

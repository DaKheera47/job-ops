import type { SettingKey } from "@server/repositories/settings";
import { getSetting } from "@server/repositories/settings";
import type { RxResumeMode } from "@shared/types";

type BaseResumeIdSettings = Partial<
  Record<
    | "rxresumeMode"
    | "rxresumeBaseResumeId"
    | "rxresumeBaseResumeIdV4"
    | "rxresumeBaseResumeIdV5",
    string | null
  >
>;

export function normalizeRxResumeMode(
  raw: string | null | undefined,
): RxResumeMode {
  return raw === "v4" ? "v4" : "v5";
}

export function getRxResumeBaseResumeIdKey(
  mode: RxResumeMode,
): Extract<SettingKey, "rxresumeBaseResumeIdV4" | "rxresumeBaseResumeIdV5"> {
  return mode === "v4" ? "rxresumeBaseResumeIdV4" : "rxresumeBaseResumeIdV5";
}

export function resolveRxResumeBaseResumeIdForMode(
  settings: BaseResumeIdSettings,
  explicitMode?: RxResumeMode,
): string | null {
  const mode = explicitMode ?? normalizeRxResumeMode(settings.rxresumeMode);
  const modeSpecific =
    mode === "v4"
      ? settings.rxresumeBaseResumeIdV4
      : settings.rxresumeBaseResumeIdV5;
  return modeSpecific?.trim() || settings.rxresumeBaseResumeId?.trim() || null;
}

export async function getConfiguredRxResumeBaseResumeId(): Promise<{
  mode: RxResumeMode;
  resumeId: string | null;
}> {
  const [modeRaw, legacyId, v4Id, v5Id] = await Promise.all([
    getSetting("rxresumeMode"),
    getSetting("rxresumeBaseResumeId"),
    getSetting("rxresumeBaseResumeIdV4"),
    getSetting("rxresumeBaseResumeIdV5"),
  ]);
  const mode = normalizeRxResumeMode(
    modeRaw ?? process.env.RXRESUME_MODE ?? null,
  );
  return {
    mode,
    resumeId: resolveRxResumeBaseResumeIdForMode(
      {
        rxresumeMode: modeRaw,
        rxresumeBaseResumeId: legacyId,
        rxresumeBaseResumeIdV4: v4Id,
        rxresumeBaseResumeIdV5: v5Id,
      },
      mode,
    ),
  };
}

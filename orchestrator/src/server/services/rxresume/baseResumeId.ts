import { getSetting } from "@server/repositories/settings";

type BaseResumeIdSettings = Partial<
  Record<"rxresumeBaseResumeId", string | null>
>;

export function resolveRxResumeBaseResumeId(
  settings: BaseResumeIdSettings,
): string | null {
  return settings.rxresumeBaseResumeId?.trim() || null;
}

export async function getConfiguredRxResumeBaseResumeId(): Promise<{
  mode: "v5";
  resumeId: string | null;
}> {
  const v5Id = await getSetting("rxresumeBaseResumeId");
  return {
    mode: "v5",
    resumeId: resolveRxResumeBaseResumeId({
      rxresumeBaseResumeId: v5Id,
    }),
  };
}

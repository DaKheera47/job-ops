import * as settingsRepo from "@server/repositories/settings";
import { settingsRegistry } from "@shared/settings-registry";

export type WritingStyle = {
  tone: string;
  formality: string;
  constraints: string;
  doNotUse: string;
};

export async function getWritingStyle(): Promise<WritingStyle> {
  const [toneRaw, formalityRaw, constraintsRaw, doNotUseRaw] =
    await Promise.all([
      settingsRepo.getSetting("chatStyleTone"),
      settingsRepo.getSetting("chatStyleFormality"),
      settingsRepo.getSetting("chatStyleConstraints"),
      settingsRepo.getSetting("chatStyleDoNotUse"),
    ]);

  return {
    tone:
      settingsRegistry.chatStyleTone.parse(toneRaw ?? undefined) ??
      settingsRegistry.chatStyleTone.default(),
    formality:
      settingsRegistry.chatStyleFormality.parse(formalityRaw ?? undefined) ??
      settingsRegistry.chatStyleFormality.default(),
    constraints:
      settingsRegistry.chatStyleConstraints.parse(
        constraintsRaw ?? undefined,
      ) ?? settingsRegistry.chatStyleConstraints.default(),
    doNotUse:
      settingsRegistry.chatStyleDoNotUse.parse(doNotUseRaw ?? undefined) ??
      settingsRegistry.chatStyleDoNotUse.default(),
  };
}

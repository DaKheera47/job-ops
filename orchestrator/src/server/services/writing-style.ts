import * as settingsRepo from "@server/repositories/settings";
import { settingsRegistry } from "@shared/settings-registry";
import type {
  ChatStyleLanguageMode,
  ChatStyleManualLanguage,
} from "@shared/types";

export type WritingStyle = {
  tone: string;
  formality: string;
  constraints: string;
  doNotUse: string;
  languageMode: ChatStyleLanguageMode;
  manualLanguage: ChatStyleManualLanguage;
};

export async function getWritingStyle(): Promise<WritingStyle> {
  const [
    toneRaw,
    formalityRaw,
    constraintsRaw,
    doNotUseRaw,
    languageModeRaw,
    manualLanguageRaw,
  ] = await Promise.all([
    settingsRepo.getSetting("chatStyleTone"),
    settingsRepo.getSetting("chatStyleFormality"),
    settingsRepo.getSetting("chatStyleConstraints"),
    settingsRepo.getSetting("chatStyleDoNotUse"),
    settingsRepo.getSetting("chatStyleLanguageMode"),
    settingsRepo.getSetting("chatStyleManualLanguage"),
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
    languageMode:
      settingsRegistry.chatStyleLanguageMode.parse(
        languageModeRaw ?? undefined,
      ) ?? settingsRegistry.chatStyleLanguageMode.default(),
    manualLanguage:
      settingsRegistry.chatStyleManualLanguage.parse(
        manualLanguageRaw ?? undefined,
      ) ?? settingsRegistry.chatStyleManualLanguage.default(),
  };
}

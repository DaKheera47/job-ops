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

const LANGUAGE_NAMES_PATTERN = "english|german|french|spanish";

const LANGUAGE_DIRECTIVE_PATTERNS = [
  new RegExp(
    String.raw`\b(?:always\s+)?(?:respond|reply|write|generate|output)(?:\s+\w+){0,3}\s+(?:in|using)\s+(?:${LANGUAGE_NAMES_PATTERN})\b[.!]?`,
    "gi",
  ),
  new RegExp(
    String.raw`\b(?:set|use|choose|default\s+to)\s+(?:the\s+)?(?:output\s+)?language(?:\s+to)?\s+(?:${LANGUAGE_NAMES_PATTERN})\b[.!]?`,
    "gi",
  ),
  new RegExp(
    String.raw`\b(?:output|response)\s+language\s*[:=]?\s*(?:${LANGUAGE_NAMES_PATTERN})\b[.!]?`,
    "gi",
  ),
];

export function stripLanguageDirectivesFromConstraints(
  constraints: string,
): string {
  if (!constraints.trim()) {
    return "";
  }

  return constraints
    .split(/\r?\n/g)
    .map((line) => {
      let nextLine = line;

      for (const pattern of LANGUAGE_DIRECTIVE_PATTERNS) {
        nextLine = nextLine.replace(pattern, "");
      }

      return nextLine
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .replace(/^[,.;:!?\s-]+|[,.;:!?\s-]+$/g, "")
        .trim();
    })
    .filter(Boolean)
    .join("\n");
}

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

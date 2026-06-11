import { detectProfileLanguage } from "@shared/language-detection";
import type {
  AppSettings,
  ChatStyleManualLanguage,
  ResumeProfile,
} from "@shared/types";

export function resolveFilenameLanguage(args: {
  settings: AppSettings | null;
  profile: ResumeProfile | null;
}): ChatStyleManualLanguage | undefined {
  const languageMode =
    args.settings?.chatStyleLanguageMode?.value ??
    args.settings?.chatStyleLanguageMode?.default ??
    "manual";

  if (languageMode === "manual") {
    return (
      args.settings?.chatStyleManualLanguage?.value ??
      args.settings?.chatStyleManualLanguage?.default ??
      "english"
    );
  }

  return args.profile
    ? (detectProfileLanguage(args.profile) ?? "english")
    : "english";
}

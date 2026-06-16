import {
  detectJobDescriptionLanguage,
  detectProfileLanguage,
  detectReactiveResumeV5Language,
} from "@shared/language-detection";
import {
  CHAT_STYLE_MANUAL_LANGUAGE_LABELS,
  type ChatStyleLanguageMode,
  type ChatStyleManualLanguage,
  type ResumeProfile,
} from "@shared/types";

export {
  detectJobDescriptionLanguage,
  detectProfileLanguage,
  detectReactiveResumeV5Language,
} from "@shared/language-detection";

type WritingLanguageConfig = {
  languageMode: ChatStyleLanguageMode;
  manualLanguage: ChatStyleManualLanguage;
};

export type ResolvedWritingLanguage = {
  language: ChatStyleManualLanguage;
  source: "manual" | "detected" | "fallback";
};

export function resolveWritingOutputLanguage(args: {
  style: WritingLanguageConfig;
  profile: ResumeProfile;
  jobDescription?: string | null;
}): ResolvedWritingLanguage {
  if (args.style.languageMode === "manual") {
    return {
      language: args.style.manualLanguage,
      source: "manual",
    };
  }

  const detectedLanguage =
    args.style.languageMode === "match-job-description"
      ? detectJobDescriptionLanguage(args.jobDescription)
      : detectProfileLanguage(args.profile);
  if (detectedLanguage) {
    return {
      language: detectedLanguage,
      source: "detected",
    };
  }

  return {
    language: "english",
    source: "fallback",
  };
}

export function resolveWritingOutputLanguageForResumeJson(args: {
  style: WritingLanguageConfig;
  resumeJson: Record<string, unknown>;
  jobDescription?: string | null;
}): ResolvedWritingLanguage {
  if (args.style.languageMode === "manual") {
    return {
      language: args.style.manualLanguage,
      source: "manual",
    };
  }

  const detectedLanguage =
    args.style.languageMode === "match-job-description"
      ? detectJobDescriptionLanguage(args.jobDescription)
      : detectReactiveResumeV5Language(args.resumeJson);
  if (detectedLanguage) {
    return {
      language: detectedLanguage,
      source: "detected",
    };
  }

  return {
    language: "english",
    source: "fallback",
  };
}

export function getWritingLanguageLabel(
  language: ChatStyleManualLanguage,
): string {
  return CHAT_STYLE_MANUAL_LANGUAGE_LABELS[language];
}

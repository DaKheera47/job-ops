import {
  CHAT_STYLE_MANUAL_LANGUAGE_LABELS,
  type ChatStyleLanguageMode,
  type ChatStyleManualLanguage,
  type ResumeProfile,
} from "@shared/types";

type WritingLanguageConfig = {
  languageMode: ChatStyleLanguageMode;
  manualLanguage: ChatStyleManualLanguage;
};

export type ResolvedWritingLanguage = {
  language: ChatStyleManualLanguage;
  source: "manual" | "detected" | "fallback";
};

const LANGUAGE_MARKERS: Record<ChatStyleManualLanguage, Set<string>> = {
  english: new Set([
    "the",
    "and",
    "with",
    "for",
    "from",
    "using",
    "building",
    "developed",
    "delivered",
    "experience",
    "led",
  ]),
  german: new Set([
    "und",
    "mit",
    "für",
    "der",
    "die",
    "das",
    "ich",
    "nicht",
    "entwicklung",
    "erfahrung",
    "verantwortlich",
  ]),
  french: new Set([
    "et",
    "avec",
    "pour",
    "les",
    "des",
    "une",
    "dans",
    "sur",
    "expérience",
    "développement",
    "responsable",
  ]),
  spanish: new Set([
    "y",
    "con",
    "para",
    "los",
    "las",
    "una",
    "que",
    "experiencia",
    "desarrollo",
    "responsable",
    "lideré",
  ]),
};

const SPECIAL_CHARACTER_PATTERNS: Partial<
  Record<ChatStyleManualLanguage, RegExp>
> = {
  german: /[äöüß]/gi,
  french: /[àâæçéèêëîïôœùûüÿ]/gi,
  spanish: /[áéíóúñ¿¡]/gi,
};

function collectProfileLanguageSample(profile: ResumeProfile): string {
  const segments: string[] = [];

  const add = (value: string | null | undefined): void => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    segments.push(trimmed);
  };

  add(profile.basics?.headline);
  add(profile.basics?.label);
  add(profile.basics?.summary);
  add(profile.sections?.summary?.content);

  for (const item of profile.sections?.projects?.items ?? []) {
    if (item.visible === false) continue;
    add(item.description);
    add(item.summary);
  }

  for (const item of profile.sections?.experience?.items ?? []) {
    if (item.visible === false) continue;
    add(item.position);
    add(item.summary);
  }

  return segments.join("\n");
}

function scoreLanguageSample(
  sample: string,
  language: ChatStyleManualLanguage,
): number {
  const normalized = sample.toLowerCase();
  const tokens = normalized.match(/\p{L}+/gu) ?? [];
  const markers = LANGUAGE_MARKERS[language];

  let score = 0;
  for (const token of tokens) {
    if (markers.has(token)) {
      score += 1;
    }
  }

  const specialCharacterPattern = SPECIAL_CHARACTER_PATTERNS[language];
  if (specialCharacterPattern) {
    score += (normalized.match(specialCharacterPattern)?.length ?? 0) * 3;
  }

  return score;
}

export function detectProfileLanguage(
  profile: ResumeProfile,
): ChatStyleManualLanguage | null {
  const sample = collectProfileLanguageSample(profile);
  if (!sample.trim()) {
    return null;
  }

  const scoredLanguages = (
    Object.keys(CHAT_STYLE_MANUAL_LANGUAGE_LABELS) as ChatStyleManualLanguage[]
  )
    .map((language) => ({
      language,
      score: scoreLanguageSample(sample, language),
    }))
    .sort((left, right) => right.score - left.score);

  const [best, second] = scoredLanguages;
  if (!best || best.score <= 0) {
    return null;
  }

  const minimumScore = best.language === "english" ? 4 : 3;
  const margin = best.score - (second?.score ?? 0);
  if (best.score < minimumScore || margin < 2) {
    return null;
  }

  return best.language;
}

export function resolveWritingOutputLanguage(args: {
  style: WritingLanguageConfig;
  profile: ResumeProfile;
}): ResolvedWritingLanguage {
  if (args.style.languageMode === "manual") {
    return {
      language: args.style.manualLanguage,
      source: "manual",
    };
  }

  const detectedLanguage = detectProfileLanguage(args.profile);
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

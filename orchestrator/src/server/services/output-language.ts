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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function collectReactiveResumeV5LanguageSample(
  resumeJson: Record<string, unknown>,
): string {
  const segments: string[] = [];

  const add = (value: unknown): void => {
    const text = toText(value).trim();
    if (!text) return;
    segments.push(text);
  };

  const basics = asRecord(resumeJson.basics);
  const summary = asRecord(resumeJson.summary);
  const sections = asRecord(resumeJson.sections);

  add(basics?.headline);
  add(summary?.content);

  const experience = asRecord(sections?.experience);
  for (const rawItem of asArray(experience?.items)) {
    const item = asRecord(rawItem);
    if (!item || item.hidden === true) continue;
    add(item.position);
    add(item.description);
    for (const rawRole of asArray(item.roles)) {
      const role = asRecord(rawRole);
      if (!role) continue;
      add(role.position);
      add(role.description);
    }
  }

  const education = asRecord(sections?.education);
  for (const rawItem of asArray(education?.items)) {
    const item = asRecord(rawItem);
    if (!item || item.hidden === true) continue;
    add(item.degree);
    add(item.area);
    add(item.description);
  }

  const projects = asRecord(sections?.projects);
  for (const rawItem of asArray(projects?.items)) {
    const item = asRecord(rawItem);
    if (!item || item.hidden === true) continue;
    add(item.name);
    add(item.description);
  }

  const skills = asRecord(sections?.skills);
  for (const rawItem of asArray(skills?.items)) {
    const item = asRecord(rawItem);
    if (!item || item.hidden === true) continue;
    add(item.name);
    for (const keyword of asArray(item.keywords)) {
      add(keyword);
    }
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
  return detectLanguageFromSample(collectProfileLanguageSample(profile));
}

export function detectReactiveResumeV5Language(
  resumeJson: Record<string, unknown>,
): ChatStyleManualLanguage | null {
  return detectLanguageFromSample(
    collectReactiveResumeV5LanguageSample(resumeJson),
  );
}

function detectLanguageFromSample(
  sample: string,
): ChatStyleManualLanguage | null {
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

export function resolveWritingOutputLanguageForResumeJson(args: {
  style: WritingLanguageConfig;
  resumeJson: Record<string, unknown>;
}): ResolvedWritingLanguage {
  if (args.style.languageMode === "manual") {
    return {
      language: args.style.manualLanguage,
      source: "manual",
    };
  }

  const detectedLanguage = detectReactiveResumeV5Language(args.resumeJson);
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

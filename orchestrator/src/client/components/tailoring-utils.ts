export interface TailoredSkillGroup {
  name: string;
  keywords: string[];
}

export interface EditableSkillGroup {
  id: string;
  name: string;
  keywordsText: string;
}

let skillDraftCounter = 0;

export function createTailoredSkillDraftId(): string {
  skillDraftCounter += 1;
  return `skill-group-${skillDraftCounter}`;
}

export function parseTailoredSkills(
  raw: string | null | undefined,
): TailoredSkillGroup[] {
  if (!raw || raw.trim().length === 0) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const groups: TailoredSkillGroup[] = [];
    const legacyKeywords: string[] = [];
    for (const item of parsed) {
      if (typeof item === "string") {
        const keyword = item.trim();
        if (keyword.length > 0) legacyKeywords.push(keyword);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const keywordsRaw = Array.isArray(record.keywords)
        ? record.keywords
        : typeof record.keywords === "string"
          ? record.keywords.split(",")
          : [];
      const keywords = keywordsRaw
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);

      if (!name && keywords.length === 0) continue;
      groups.push({ name, keywords });
    }

    if (legacyKeywords.length > 0) {
      groups.push({ name: "Skills", keywords: legacyKeywords });
    }

    return groups;
  } catch {
    return [];
  }
}

export function serializeTailoredSkills(groups: TailoredSkillGroup[]): string {
  if (groups.length === 0) return "";
  return JSON.stringify(groups);
}

export function toEditableSkillGroups(
  groups: TailoredSkillGroup[],
): EditableSkillGroup[] {
  return groups.map((group) => ({
    id: createTailoredSkillDraftId(),
    name: group.name,
    keywordsText: group.keywords.join(", "),
  }));
}

export function fromEditableSkillGroups(
  groups: EditableSkillGroup[],
): TailoredSkillGroup[] {
  const normalized: TailoredSkillGroup[] = [];

  for (const group of groups) {
    const name = group.name.trim();
    const keywords = group.keywordsText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!name && keywords.length === 0) continue;
    normalized.push({ name, keywords });
  }

  return normalized;
}

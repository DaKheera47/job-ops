type RecordLike = Record<string, unknown>;

export type DesignResumeJakeContactItem = {
  text: string;
  url?: string | null;
};

export type DesignResumeJakeEntry = {
  id: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  date?: string | null;
  bullets: string[];
  url?: string | null;
};

export type DesignResumeJakeSkillGroup = {
  id: string;
  name: string;
  keywords: string[];
};

export type DesignResumeJakeDocument = {
  name: string;
  headline?: string | null;
  contacts: DesignResumeJakeContactItem[];
  summary?: string | null;
  experience: DesignResumeJakeEntry[];
  education: DesignResumeJakeEntry[];
  projects: DesignResumeJakeEntry[];
  skills: DesignResumeJakeSkillGroup[];
};

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getByPath(source: RecordLike, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as RecordLike)[segment];
  }, source);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
      .replace(/<\/li>\s*<li[^>]*>/gi, "\n")
      .replace(/<\/?[^>]+>/g, " "),
  )
    .replace(/\s*\n\s*/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function extractBullets(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];

  const listItems = [...value.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => stripHtml(match[1] ?? ""))
    .filter(Boolean);
  if (listItems.length > 0) return listItems;

  const cleaned = stripHtml(value);
  if (!cleaned) return [];
  return cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function dedupeContacts(
  contacts: DesignResumeJakeContactItem[],
): DesignResumeJakeContactItem[] {
  const seen = new Set<string>();
  return contacts.filter((item) => {
    const key = `${item.text}|${item.url ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getVisibleSectionItems(
  resumeJson: RecordLike,
  sectionKey: string,
): RecordLike[] {
  const sections = (asRecord(resumeJson.sections) ?? {}) as RecordLike;
  const section = (asRecord(sections[sectionKey]) ?? {}) as RecordLike;
  if (toBoolean(section.hidden, false)) return [];

  return asArray(section.items)
    .map((item) => asRecord(item) ?? {})
    .filter((item) => !toBoolean(item.hidden, false)) as RecordLike[];
}

function buildContacts(resumeJson: RecordLike): DesignResumeJakeContactItem[] {
  const basics = (asRecord(resumeJson.basics) ?? {}) as RecordLike;
  const sections = (asRecord(resumeJson.sections) ?? {}) as RecordLike;
  const contacts: DesignResumeJakeContactItem[] = [];

  const phone = toText(basics.phone);
  if (phone) contacts.push({ text: phone });

  const email = toText(basics.email);
  if (email) contacts.push({ text: email, url: `mailto:${email}` });

  const websiteUrl = toText(getByPath(basics, "website.url"));
  const websiteLabel = toText(getByPath(basics, "website.label")) || websiteUrl;
  if (websiteUrl) contacts.push({ text: websiteLabel, url: websiteUrl });

  const profilesSection = (asRecord(sections.profiles) ?? {}) as RecordLike;
  const profileItems = asArray(profilesSection.items).map(
    (item) => asRecord(item) ?? {},
  ) as RecordLike[];
  for (const item of profileItems) {
    if (toBoolean(item.hidden, false)) continue;
    const url = toText(getByPath(item, "website.url"));
    const network = toText(item.network);
    const username = toText(item.username);
    const label = network || username || url;
    if (label) contacts.push({ text: label, url: url || undefined });
  }

  const customFields = asArray(basics.customFields).map(
    (item) => asRecord(item) ?? {},
  ) as RecordLike[];
  for (const field of customFields) {
    const text =
      toText(field.text) || toText(field.name) || toText(field.value);
    const link = toText(field.link);
    if (text) contacts.push({ text, url: link || undefined });
  }

  return dedupeContacts(contacts);
}

function toExperienceEntries(resumeJson: RecordLike): DesignResumeJakeEntry[] {
  return getVisibleSectionItems(resumeJson, "experience").map(
    (item, index) => ({
      id: toText(item.id, `experience-${index}`),
      title: toText(item.company, "Untitled"),
      subtitle: toText(item.position) || null,
      meta: toText(item.location) || null,
      date: toText(item.period) || null,
      bullets: extractBullets(item.description),
      url: toText(getByPath(item, "website.url")) || undefined,
    }),
  );
}

function toEducationEntries(resumeJson: RecordLike): DesignResumeJakeEntry[] {
  return getVisibleSectionItems(resumeJson, "education").map((item, index) => ({
    id: toText(item.id, `education-${index}`),
    title: toText(item.school, "Untitled"),
    subtitle:
      [toText(item.degree), toText(item.area)].filter(Boolean).join(", ") ||
      null,
    meta:
      [toText(item.location), toText(item.grade)].filter(Boolean).join(" | ") ||
      null,
    date: toText(item.period) || null,
    bullets: extractBullets(item.description),
    url: toText(getByPath(item, "website.url")) || undefined,
  }));
}

function toProjectEntries(resumeJson: RecordLike): DesignResumeJakeEntry[] {
  return getVisibleSectionItems(resumeJson, "projects").map((item, index) => {
    const technologies = asArray(item.keywords)
      .map((value) => toText(value))
      .filter(Boolean)
      .join(", ");

    return {
      id: toText(item.id, `project-${index}`),
      title: toText(item.name, "Untitled"),
      subtitle: technologies || null,
      date: toText(item.period) || null,
      bullets: extractBullets(item.description),
      url: toText(getByPath(item, "website.url")) || undefined,
    };
  });
}

function toSkillGroups(resumeJson: RecordLike): DesignResumeJakeSkillGroup[] {
  return getVisibleSectionItems(resumeJson, "skills").map((item, index) => ({
    id: toText(item.id, `skill-${index}`),
    name: toText(item.name, "Skills"),
    keywords: asArray(item.keywords)
      .map((entry) => toText(entry))
      .filter(Boolean),
  }));
}

export function buildDesignResumeJakeDocument(
  resumeJson: Record<string, unknown>,
): DesignResumeJakeDocument {
  const basics = (asRecord(resumeJson.basics) ?? {}) as RecordLike;
  const summary = (asRecord(resumeJson.summary) ?? {}) as RecordLike;

  return {
    name: toText(basics.name, "Your Name"),
    headline: toText(basics.headline) || null,
    contacts: buildContacts(resumeJson),
    summary:
      !toBoolean(summary.hidden, false) && toText(summary.content)
        ? stripHtml(toText(summary.content))
        : null,
    experience: toExperienceEntries(resumeJson),
    education: toEducationEntries(resumeJson),
    projects: toProjectEntries(resumeJson),
    skills: toSkillGroups(resumeJson),
  };
}

import type { ChatStyleManualLanguage } from "@shared/types";
import type {
  LatexResumeContactItem,
  LatexResumeCustomFieldItem,
  LatexResumeDocument,
  LatexResumeEntry,
  LatexResumeInterestItem,
  LatexResumeLanguageItem,
  LatexResumeOrderedSectionKey,
  LatexResumePicture,
  LatexResumeProfileItem,
  LatexResumeSectionTitles,
  LatexResumeSkillGroup,
  NormalizeResumeJsonToLatexDocumentOptions,
} from "./types";

type RecordLike = Record<string, unknown>;

const LOCAL_ASSET_URL_PATTERN =
  /^\/api\/design-resume\/assets\/([^/]+)\/content$/;

const LATEX_RESUME_SECTION_TITLES: Record<
  ChatStyleManualLanguage,
  LatexResumeSectionTitles
> = {
  english: {
    profiles: "Profiles",
    summary: "Summary",
    customFields: "Custom Fields",
    experience: "Experience",
    education: "Education",
    projects: "Projects",
    skills: "Technical Skills",
    languages: "Languages",
    interests: "Interests",
    awards: "Awards",
    certifications: "Certifications",
    publications: "Publications",
    volunteer: "Volunteer",
    references: "References",
  },
  german: {
    profiles: "Profile",
    summary: "Zusammenfassung",
    customFields: "Zusatzangaben",
    experience: "Berufserfahrung",
    education: "Ausbildung",
    projects: "Projekte",
    skills: "Fachliche Kenntnisse",
    languages: "Sprachen",
    interests: "Interessen",
    awards: "Auszeichnungen",
    certifications: "Zertifikate",
    publications: "Veröffentlichungen",
    volunteer: "Ehrenamt",
    references: "Referenzen",
  },
  french: {
    profiles: "Profils",
    summary: "Résumé",
    customFields: "Champs personnalisés",
    experience: "Expérience",
    education: "Formation",
    projects: "Projets",
    skills: "Compétences techniques",
    languages: "Langues",
    interests: "Centres d'intérêt",
    awards: "Récompenses",
    certifications: "Certifications",
    publications: "Publications",
    volunteer: "Bénévolat",
    references: "Références",
  },
  spanish: {
    profiles: "Perfiles",
    summary: "Resumen",
    customFields: "Campos personalizados",
    experience: "Experiencia",
    education: "Educación",
    projects: "Proyectos",
    skills: "Habilidades técnicas",
    languages: "Idiomas",
    interests: "Intereses",
    awards: "Premios",
    certifications: "Certificaciones",
    publications: "Publicaciones",
    volunteer: "Voluntariado",
    references: "Referencias",
  },
};

const ORDERABLE_SECTION_KEYS = [
  "profiles",
  "experience",
  "education",
  "projects",
  "skills",
  "languages",
  "interests",
  "awards",
  "certifications",
  "publications",
  "volunteer",
  "references",
] as const satisfies readonly LatexResumeOrderedSectionKey[];

function asRecord(value: unknown): RecordLike | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function joinNonEmpty(
  parts: Array<string | null | undefined>,
  separator: string,
) {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(separator);
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

function getSectionRecord(resumeJson: RecordLike, key: string): RecordLike {
  const sections = (asRecord(resumeJson.sections) ?? {}) as RecordLike;
  return (asRecord(sections[key]) ?? {}) as RecordLike;
}

function getVisibleSectionItems(
  resumeJson: RecordLike,
  key: string,
): RecordLike[] {
  const section = getSectionRecord(resumeJson, key);
  if (toBoolean(section.hidden, false)) return [];

  return asArray(section.items)
    .map((item) => asRecord(item) ?? {})
    .filter((item) => !toBoolean(item.hidden, false)) as RecordLike[];
}

function getSectionTitle(
  resumeJson: RecordLike,
  key: keyof LatexResumeSectionTitles,
  titles: LatexResumeSectionTitles,
): string {
  if (key === "summary") {
    const summary = (asRecord(resumeJson.summary) ?? {}) as RecordLike;
    return toText(summary.title).trim() || titles.summary;
  }

  const section = getSectionRecord(resumeJson, key);
  return toText(section.title).trim() || titles[key];
}

function getCustomFieldsTitle(
  resumeJson: RecordLike,
  titles: LatexResumeSectionTitles,
): string {
  const basics = (asRecord(resumeJson.basics) ?? {}) as RecordLike;
  return toText(basics.customFieldsTitle).trim() || titles.customFields;
}

function getOrderedSectionKeys(
  resumeJson: RecordLike,
): LatexResumeOrderedSectionKey[] {
  const metadata = asRecord(resumeJson.metadata);
  const layout = asRecord(metadata?.layout);
  const pages = asArray(layout?.pages);
  const firstPage = asRecord(pages[0]);
  const mainSections = asArray(firstPage?.main);

  const order: LatexResumeOrderedSectionKey[] = [];
  const allowed = new Set<LatexResumeOrderedSectionKey>(ORDERABLE_SECTION_KEYS);

  for (const key of mainSections) {
    if (
      typeof key === "string" &&
      allowed.has(key as LatexResumeOrderedSectionKey) &&
      !order.includes(key as LatexResumeOrderedSectionKey)
    ) {
      order.push(key as LatexResumeOrderedSectionKey);
    }
  }

  for (const key of ORDERABLE_SECTION_KEYS) {
    if (!order.includes(key)) {
      order.push(key);
    }
  }

  return order;
}

function buildPicture(resumeJson: RecordLike): LatexResumePicture | null {
  const picture = (asRecord(resumeJson.picture) ?? {}) as RecordLike;
  const url = toText(picture.url).trim();
  const assetId = LOCAL_ASSET_URL_PATTERN.exec(url)?.[1] ?? null;

  return {
    url: url || null,
    assetId,
    renderPath: null,
    hidden: toBoolean(picture.hidden, true),
    size: toNumber(picture.size, 80),
    rotation: toNumber(picture.rotation, 0),
    aspectRatio: toNumber(picture.aspectRatio, 1),
    borderRadius: toNumber(picture.borderRadius, 0),
    borderColor: toText(picture.borderColor),
    borderWidth: toNumber(picture.borderWidth, 0),
    shadowColor: toText(picture.shadowColor),
    shadowWidth: toNumber(picture.shadowWidth, 0),
  };
}

function buildContactItems(resumeJson: RecordLike): LatexResumeContactItem[] {
  const basics = (asRecord(resumeJson.basics) ?? {}) as RecordLike;
  const items: LatexResumeContactItem[] = [];

  const phone = toText(basics.phone).trim();
  if (phone) items.push({ text: phone, kind: "phone" });

  const email = toText(basics.email).trim();
  if (email) {
    items.push({ text: email, url: `mailto:${email}`, kind: "email" });
  }

  const websiteUrl = toText(getByPath(basics, "website.url")).trim();
  const websiteLabel =
    toText(getByPath(basics, "website.label")).trim() || websiteUrl;
  if (websiteUrl) {
    items.push({
      text: websiteLabel,
      url: websiteUrl,
      kind: "website",
    });
  }

  return items;
}

function buildProfileItems(resumeJson: RecordLike): LatexResumeProfileItem[] {
  return getVisibleSectionItems(resumeJson, "profiles").map((item) => {
    const url = toText(getByPath(item, "website.url")).trim();
    return {
      network:
        toText(item.network).trim() ||
        toText(item.username).trim() ||
        url ||
        "Profile",
      username: toText(item.username).trim() || null,
      url: url || null,
    };
  });
}

function buildCustomFieldItems(
  resumeJson: RecordLike,
): LatexResumeCustomFieldItem[] {
  const basics = (asRecord(resumeJson.basics) ?? {}) as RecordLike;
  return asArray(basics.customFields)
    .map((item) => asRecord(item) ?? {})
    .map((item) => {
      const title =
        toText(item.title).trim() || toText(item.name).trim() || null;
      const text =
        toText(item.text).trim() || toText(item.value).trim() || title || "";
      return {
        title,
        text,
        url: toText(item.link).trim() || null,
      };
    })
    .filter((item) => item.title || item.text);
}

function buildExperienceEntries(resumeJson: RecordLike): LatexResumeEntry[] {
  return getVisibleSectionItems(resumeJson, "experience").map(
    (item, index) => ({
      title: toText(item.company, `Experience ${index + 1}`),
      subtitle:
        joinNonEmpty([toText(item.position), toText(item.location)], " / ") ||
        null,
      date: toText(item.period) || null,
      bullets: extractBullets(item.description),
      url: toText(getByPath(item, "website.url")) || undefined,
    }),
  );
}

function buildEducationEntries(resumeJson: RecordLike): LatexResumeEntry[] {
  return getVisibleSectionItems(resumeJson, "education").map((item, index) => ({
    title: toText(item.school, `Education ${index + 1}`),
    subtitle:
      joinNonEmpty([toText(item.degree), toText(item.area)], ", ") || null,
    secondarySubtitle:
      joinNonEmpty([toText(item.location), toText(item.grade)], " | ") || null,
    date: toText(item.period) || null,
    bullets: extractBullets(item.description),
    url: toText(getByPath(item, "website.url")) || undefined,
  }));
}

function buildProjectEntries(resumeJson: RecordLike): LatexResumeEntry[] {
  return getVisibleSectionItems(resumeJson, "projects").map((item, index) => ({
    title: toText(item.name, `Project ${index + 1}`),
    subtitle:
      asArray(item.keywords)
        .map((keyword) => toText(keyword).trim())
        .filter(Boolean)
        .join(", ") || null,
    date: toText(item.period) || null,
    bullets: extractBullets(item.description),
    url: toText(getByPath(item, "website.url")) || undefined,
  }));
}

function buildSkillGroups(resumeJson: RecordLike): LatexResumeSkillGroup[] {
  return getVisibleSectionItems(resumeJson, "skills").map((item, index) => ({
    name: toText(item.name, `Skills ${index + 1}`),
    keywords: asArray(item.keywords)
      .map((keyword) => toText(keyword).trim())
      .filter(Boolean),
  }));
}

function buildLanguageItems(resumeJson: RecordLike): LatexResumeLanguageItem[] {
  return getVisibleSectionItems(resumeJson, "languages").map((item) => ({
    language: toText(item.language, "Language"),
    fluency: toText(item.fluency).trim() || null,
    level:
      typeof item.level === "number" && Number.isFinite(item.level)
        ? item.level
        : null,
  }));
}

function buildInterestItems(resumeJson: RecordLike): LatexResumeInterestItem[] {
  return getVisibleSectionItems(resumeJson, "interests").map((item, index) => ({
    name: toText(item.name, `Interest ${index + 1}`),
    keywords: asArray(item.keywords)
      .map((keyword) => toText(keyword).trim())
      .filter(Boolean),
  }));
}

function buildAwardsEntries(resumeJson: RecordLike): LatexResumeEntry[] {
  return getVisibleSectionItems(resumeJson, "awards").map((item, index) => ({
    title: toText(item.title, `Award ${index + 1}`),
    subtitle: toText(item.awarder).trim() || null,
    date: toText(item.date) || null,
    bullets: extractBullets(item.description),
    url: toText(getByPath(item, "website.url")) || undefined,
  }));
}

function buildCertificationEntries(resumeJson: RecordLike): LatexResumeEntry[] {
  return getVisibleSectionItems(resumeJson, "certifications").map(
    (item, index) => ({
      title: toText(item.title, `Certification ${index + 1}`),
      subtitle: toText(item.issuer).trim() || null,
      date: toText(item.date) || null,
      bullets: extractBullets(item.description),
      url: toText(getByPath(item, "website.url")) || undefined,
    }),
  );
}

function buildPublicationEntries(resumeJson: RecordLike): LatexResumeEntry[] {
  return getVisibleSectionItems(resumeJson, "publications").map(
    (item, index) => ({
      title: toText(item.title, `Publication ${index + 1}`),
      subtitle: toText(item.publisher).trim() || null,
      date: toText(item.date) || null,
      bullets: extractBullets(item.description),
      url: toText(getByPath(item, "website.url")) || undefined,
    }),
  );
}

function buildVolunteerEntries(resumeJson: RecordLike): LatexResumeEntry[] {
  return getVisibleSectionItems(resumeJson, "volunteer").map((item, index) => ({
    title: toText(item.organization, `Volunteer ${index + 1}`),
    subtitle: toText(item.location).trim() || null,
    date: toText(item.period) || null,
    bullets: extractBullets(item.description),
    url: toText(getByPath(item, "website.url")) || undefined,
  }));
}

function buildReferenceEntries(resumeJson: RecordLike): LatexResumeEntry[] {
  return getVisibleSectionItems(resumeJson, "references").map(
    (item, index) => ({
      title: toText(item.name, `Reference ${index + 1}`),
      subtitle:
        joinNonEmpty([toText(item.position), toText(item.phone)], " | ") ||
        null,
      bullets: extractBullets(item.description),
      url: toText(getByPath(item, "website.url")) || undefined,
    }),
  );
}

export function getLatexResumeSectionTitles(
  language: ChatStyleManualLanguage = "english",
): LatexResumeSectionTitles {
  return LATEX_RESUME_SECTION_TITLES[language];
}

export function normalizeResumeJsonToLatexDocument(
  resumeJson: Record<string, unknown>,
  options: NormalizeResumeJsonToLatexDocumentOptions = {},
): LatexResumeDocument {
  const record = (asRecord(resumeJson) ?? {}) as RecordLike;
  const basics = (asRecord(record.basics) ?? {}) as RecordLike;
  const summary = (asRecord(record.summary) ?? {}) as RecordLike;
  const titles = getLatexResumeSectionTitles(options.language);

  return {
    name: toText(basics.name, "Your Name"),
    headline: toText(basics.headline).trim() || null,
    location: toText(basics.location).trim() || null,
    picture: buildPicture(record),
    contactItems: buildContactItems(record),
    profileItems: buildProfileItems(record),
    customFieldItems: buildCustomFieldItems(record),
    summary:
      !toBoolean(summary.hidden, false) && toText(summary.content).trim()
        ? stripHtml(toText(summary.content))
        : null,
    experience: buildExperienceEntries(record),
    education: buildEducationEntries(record),
    projects: buildProjectEntries(record),
    skillGroups: buildSkillGroups(record),
    languages: buildLanguageItems(record),
    interests: buildInterestItems(record),
    awards: buildAwardsEntries(record),
    certifications: buildCertificationEntries(record),
    publications: buildPublicationEntries(record),
    volunteer: buildVolunteerEntries(record),
    references: buildReferenceEntries(record),
    sectionOrder: getOrderedSectionKeys(record),
    sectionTitles: {
      profiles: getSectionTitle(record, "profiles", titles),
      summary: getSectionTitle(record, "summary", titles),
      customFields: getCustomFieldsTitle(record, titles),
      experience: getSectionTitle(record, "experience", titles),
      education: getSectionTitle(record, "education", titles),
      projects: getSectionTitle(record, "projects", titles),
      skills: getSectionTitle(record, "skills", titles),
      languages: getSectionTitle(record, "languages", titles),
      interests: getSectionTitle(record, "interests", titles),
      awards: getSectionTitle(record, "awards", titles),
      certifications: getSectionTitle(record, "certifications", titles),
      publications: getSectionTitle(record, "publications", titles),
      volunteer: getSectionTitle(record, "volunteer", titles),
      references: getSectionTitle(record, "references", titles),
    },
  };
}

export function buildResumeRenderDocument(
  resumeJson: Record<string, unknown>,
  options: NormalizeResumeJsonToLatexDocumentOptions = {},
): LatexResumeDocument {
  return normalizeResumeJsonToLatexDocument(resumeJson, options);
}

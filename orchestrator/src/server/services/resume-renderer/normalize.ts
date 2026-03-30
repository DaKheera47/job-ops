import type { PreparedRxResumePdfPayload } from "@server/services/rxresume";
import { normalizeWhitespace } from "@shared/utils/string";
import type {
  LatexResumeContactItem,
  LatexResumeDocument,
  LatexResumeEntry,
  LatexResumeSkillGroup,
} from "./types";

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? normalizeWhitespace(value)
    : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtmlPreservingBreaks(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
      .replace(/<\/li>\s*<li[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  );
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = normalizeWhitespace(
    stripHtmlPreservingBreaks(value).replace(/\s*\n\s*/g, "\n"),
  );
  return cleaned || null;
}

function extractBulletLines(value: unknown): string[] {
  if (typeof value !== "string") return [];

  const listItems = [...value.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => cleanText(match[1]))
    .filter((item): item is string => Boolean(item));
  if (listItems.length > 0) return listItems;

  const withParagraphBreaks = decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<\/?p[^>]*>/gi, "");
  const lines = withParagraphBreaks
    .split(/\n+/)
    .flatMap((line) => line.split(/\s+[•*-]\s+/))
    .map((line) => cleanText(line))
    .filter((item): item is string => Boolean(item));

  if (lines.length > 1) return lines;

  const single = cleanText(value);
  return single ? [single] : [];
}

function isVisible(
  mode: PreparedRxResumePdfPayload["mode"],
  value: RecordLike | null,
): boolean {
  if (!value) return false;
  if (mode === "v5") return value.hidden !== true;
  return value.visible !== false;
}

function getUrlNode(
  mode: PreparedRxResumePdfPayload["mode"],
  value: unknown,
): { url: string; label: string | null } | null {
  const record = asRecord(value);
  if (!record) return null;

  if (mode === "v5") {
    const url = getString(record.url);
    if (!url) return null;
    return { url, label: getString(record.label) };
  }

  const href = getString(record.href);
  if (!href) return null;
  return { url: href, label: getString(record.label) };
}

function getSectionRecord(
  resumeData: RecordLike,
  key: string,
): RecordLike | null {
  return asRecord(asRecord(resumeData.sections)?.[key]);
}

function getTopLevelSummary(resumeData: RecordLike): string | null {
  const topLevel = asRecord(resumeData.summary);
  if (!topLevel) return null;
  return cleanText(topLevel.content) ?? cleanText(topLevel.value);
}

function dedupeContacts(
  items: LatexResumeContactItem[],
): LatexResumeContactItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.text}|${item.url ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toContactItems(
  prepared: PreparedRxResumePdfPayload,
): LatexResumeContactItem[] {
  const basics = asRecord(prepared.data.basics);
  if (!basics) return [];

  const items: LatexResumeContactItem[] = [];
  const phone = getString(basics.phone);
  if (phone) items.push({ text: phone });

  const email = getString(basics.email);
  if (email) items.push({ text: email, url: `mailto:${email}` });

  const website = getUrlNode(
    prepared.mode,
    prepared.mode === "v5" ? basics.website : basics.url,
  );
  if (website) {
    items.push({
      text: website.label ?? website.url,
      url: website.url,
    });
  }

  const profilesSection = getSectionRecord(prepared.data, "profiles");
  const profiles = asArray(profilesSection?.items).reduce<
    LatexResumeContactItem[]
  >((acc, rawItem) => {
    const item = asRecord(rawItem);
    if (!item || !isVisible(prepared.mode, item)) return acc;

    const urlNode = getUrlNode(prepared.mode, item.url);
    if (!urlNode) return acc;

    acc.push({
      text:
        getString(item.network) ??
        urlNode.label ??
        getString(item.username) ??
        urlNode.url,
      url: urlNode.url,
    });
    return acc;
  }, []);

  return dedupeContacts([...items, ...profiles]);
}

function toEntry(
  prepared: PreparedRxResumePdfPayload,
  item: RecordLike,
  config: {
    titleKeys: string[];
    subtitleBuilder?: (item: RecordLike) => string | null;
    secondaryTitleKeys?: string[];
    secondarySubtitleKeys?: string[];
    dateKeys: string[];
    urlKeys?: string[];
    bulletKeys: string[];
    fallbackBulletKeys?: string[];
    linkLabelBuilder?: (item: RecordLike) => string | null;
  },
): LatexResumeEntry | null {
  if (!isVisible(prepared.mode, item)) return null;

  const title =
    config.titleKeys.map((key) => getString(item[key])).find(Boolean) ?? null;
  if (!title) return null;

  const subtitle = config.subtitleBuilder ? config.subtitleBuilder(item) : null;
  const secondaryTitle =
    config.secondaryTitleKeys
      ?.map((key) => getString(item[key]))
      .find(Boolean) ?? null;
  const secondarySubtitle =
    config.secondarySubtitleKeys
      ?.map((key) => getString(item[key]))
      .find(Boolean) ?? null;
  const date =
    config.dateKeys.map((key) => getString(item[key])).find(Boolean) ?? null;
  const bullets = config.bulletKeys.flatMap((key) =>
    extractBulletLines(item[key]),
  );
  const fallbackBullets =
    bullets.length > 0
      ? bullets
      : (config.fallbackBulletKeys ?? []).flatMap((key) =>
          extractBulletLines(item[key]),
        );

  const urlNode =
    config.urlKeys
      ?.map((key) => getUrlNode(prepared.mode, item[key]))
      .find(Boolean) ?? null;

  return {
    title,
    subtitle,
    secondaryTitle,
    secondarySubtitle,
    date,
    bullets: fallbackBullets,
    url: urlNode?.url ?? null,
    linkLabel: config.linkLabelBuilder?.(item) ?? urlNode?.label ?? null,
  };
}

function joinParts(
  parts: Array<string | null | undefined>,
  separator = ", ",
): string | null {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(separator) : null;
}

function toExperienceEntries(
  prepared: PreparedRxResumePdfPayload,
): LatexResumeEntry[] {
  const section = getSectionRecord(prepared.data, "experience");
  if (!isVisible(prepared.mode, section)) return [];

  return asArray(section?.items)
    .map((item) => asRecord(item))
    .filter((item): item is RecordLike => Boolean(item))
    .map((item) =>
      toEntry(prepared, item, {
        titleKeys: ["company", "name"],
        subtitleBuilder: (value) =>
          joinParts(
            [getString(value.position), getString(value.location)],
            " | ",
          ),
        secondaryTitleKeys: [],
        secondarySubtitleKeys: [],
        dateKeys: ["date", "period"],
        urlKeys: ["url", "website"],
        bulletKeys: ["summary"],
      }),
    )
    .filter((entry): entry is LatexResumeEntry => Boolean(entry));
}

function toEducationEntries(
  prepared: PreparedRxResumePdfPayload,
): LatexResumeEntry[] {
  const section = getSectionRecord(prepared.data, "education");
  if (!isVisible(prepared.mode, section)) return [];

  return asArray(section?.items)
    .map((item) => asRecord(item))
    .filter((item): item is RecordLike => Boolean(item))
    .map((item) =>
      toEntry(prepared, item, {
        titleKeys: ["institution", "name"],
        subtitleBuilder: (value) => {
          const study = getString(value.studyType);
          const area = getString(value.area);
          if (study && area) return `${study} in ${area}`;
          return study ?? area;
        },
        dateKeys: ["date", "period"],
        urlKeys: ["url", "website"],
        bulletKeys: ["summary"],
        fallbackBulletKeys: ["score"],
      }),
    )
    .filter((entry): entry is LatexResumeEntry => Boolean(entry));
}

function toProjectEntries(
  prepared: PreparedRxResumePdfPayload,
): LatexResumeEntry[] {
  const section = getSectionRecord(prepared.data, "projects");
  if (!isVisible(prepared.mode, section)) return [];

  return asArray(section?.items)
    .map((item) => asRecord(item))
    .filter((item): item is RecordLike => Boolean(item))
    .map((item) =>
      toEntry(prepared, item, {
        titleKeys: ["name"],
        subtitleBuilder: (value) => {
          const keywords = asArray(value.keywords)
            .map((keyword) => getString(keyword))
            .filter((keyword): keyword is string => Boolean(keyword));
          return keywords.length > 0
            ? keywords.join(", ")
            : getString(value.description);
        },
        dateKeys: ["date", "period"],
        urlKeys: ["url", "website"],
        bulletKeys: ["summary"],
        fallbackBulletKeys: ["description"],
      }),
    )
    .filter((entry): entry is LatexResumeEntry => Boolean(entry));
}

function toSkillGroups(
  prepared: PreparedRxResumePdfPayload,
): LatexResumeSkillGroup[] {
  const section = getSectionRecord(prepared.data, "skills");
  if (!isVisible(prepared.mode, section)) return [];

  return asArray(section?.items)
    .map((item) => asRecord(item))
    .filter(
      (item): item is RecordLike =>
        Boolean(item) && isVisible(prepared.mode, item),
    )
    .map((item) => {
      const name = getString(item.name);
      if (!name) return null;

      const keywords = asArray(item.keywords)
        .map((keyword) => getString(keyword))
        .filter((keyword): keyword is string => Boolean(keyword));
      const description = getString(item.description);
      return {
        name,
        keywords:
          keywords.length > 0 ? keywords : description ? [description] : [],
      } satisfies LatexResumeSkillGroup;
    })
    .filter((item): item is LatexResumeSkillGroup => Boolean(item));
}

export function normalizePreparedResumeToLatexDocument(
  prepared: PreparedRxResumePdfPayload,
): LatexResumeDocument {
  const basics = asRecord(prepared.data.basics);
  const name = getString(basics?.name) ?? getString(basics?.label) ?? "Resume";
  const headline =
    getString(basics?.headline) ?? getString(basics?.label) ?? null;
  const summary =
    getTopLevelSummary(prepared.data) ??
    cleanText(getSectionRecord(prepared.data, "summary")?.content) ??
    cleanText(basics?.summary) ??
    null;

  return {
    name,
    headline,
    contactItems: toContactItems(prepared),
    summary,
    experience: toExperienceEntries(prepared),
    education: toEducationEntries(prepared),
    projects: toProjectEntries(prepared),
    skillGroups: toSkillGroups(prepared),
  };
}

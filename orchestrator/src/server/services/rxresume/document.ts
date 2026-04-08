import { createId } from "@paralleldrive/cuid2";
import { resolveTracerPublicBaseUrl } from "@server/services/tracer-links";
import { parseV4ResumeData } from "./schema/v4";

type RecordLike = Record<string, unknown>;

const VALID_TEMPLATES = new Set([
  "azurill",
  "bronzor",
  "chikorita",
  "ditgar",
  "ditto",
  "gengar",
  "glalie",
  "kakuna",
  "lapras",
  "leafish",
  "onyx",
  "pikachu",
  "rhyhorn",
]);

const VALID_PAGE_FORMATS = new Set(["a4", "letter", "free-form"]);
const VALID_LEVEL_TYPES = new Set([
  "hidden",
  "circle",
  "square",
  "rectangle",
  "rectangle-full",
  "progress-bar",
  "icon",
]);

const DEFAULT_MAIN_SECTIONS = [
  "summary",
  "experience",
  "education",
  "projects",
  "references",
];

const DEFAULT_SIDEBAR_SECTIONS = [
  "profiles",
  "skills",
  "certifications",
  "interests",
  "languages",
  "awards",
  "volunteer",
  "publications",
];

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

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function defaultWebsite() {
  return { url: "", label: "" };
}

function defaultOptions() {
  return { showLinkInTitle: false };
}

function defaultSectionBase(title: string) {
  return { title, columns: 1, hidden: false };
}

function defaultPicture() {
  return {
    hidden: false,
    url: "",
    size: 96,
    rotation: 0,
    aspectRatio: 1,
    borderRadius: 0,
    borderColor: "rgba(214, 211, 209, 1)",
    borderWidth: 0,
    shadowColor: "rgba(28, 25, 23, 0.16)",
    shadowWidth: 0,
  };
}

function buildDefaultPageLayout(customSections: unknown) {
  const customIds = asArray(customSections)
    .map((section) => asRecord(section))
    .filter((section): section is RecordLike => Boolean(section))
    .map((section) => toText(section.id))
    .filter(Boolean);

  return {
    fullWidth: false,
    main: [...DEFAULT_MAIN_SECTIONS],
    sidebar: [...DEFAULT_SIDEBAR_SECTIONS, ...customIds],
  };
}

function pickTemplate(value: unknown): string {
  const template = toText(value).trim().toLowerCase();
  return VALID_TEMPLATES.has(template) ? template : "gengar";
}

function normalizeFontWeights(value: unknown): string[] {
  const weights = asArray(value)
    .map((entry) => toText(entry).trim())
    .filter((entry) =>
      ["100", "200", "300", "400", "500", "600", "700", "800", "900"].includes(
        entry,
      ),
    );
  return weights.length > 0 ? weights : ["400"];
}

function normalizeTypographyBlock(
  value: unknown,
  fallback: {
    fontFamily: string;
    fontWeights: string[];
    fontSize: number;
    lineHeight: number;
  },
) {
  const record = asRecord(value);
  return {
    fontFamily: toText(record?.fontFamily, fallback.fontFamily),
    fontWeights: normalizeFontWeights(
      record?.fontWeights ?? fallback.fontWeights,
    ),
    fontSize: toNumber(record?.fontSize, fallback.fontSize),
    lineHeight: toNumber(record?.lineHeight, fallback.lineHeight),
  };
}

function normalizeLayoutPages(
  value: unknown,
  defaultPage: { fullWidth: boolean; main: string[]; sidebar: string[] },
) {
  const pages = asArray(value);
  if (pages.length === 0) {
    return [defaultPage];
  }

  const normalized = pages
    .map((page) => {
      const record = asRecord(page);
      if (record) {
        return {
          fullWidth: toBoolean(record.fullWidth, false),
          main: asArray(record.main).map((entry) => toText(entry)),
          sidebar: asArray(record.sidebar).map((entry) => toText(entry)),
        };
      }

      if (Array.isArray(page)) {
        const [main, sidebar] = page as unknown[];
        return {
          fullWidth: false,
          main: asArray(main).map((entry) => toText(entry)),
          sidebar: asArray(sidebar).map((entry) => toText(entry)),
        };
      }

      return null;
    })
    .filter(
      (
        page,
      ): page is { fullWidth: boolean; main: string[]; sidebar: string[] } =>
        Boolean(page),
    );

  return normalized.length > 0 ? normalized : [defaultPage];
}

function normalizeUrl(
  value: unknown,
  publicBaseUrl: string | null,
): { url: string; label: string } {
  const record = asRecord(value);
  const rawUrl = toText(record?.url ?? record?.href ?? value).trim();
  const url =
    rawUrl.startsWith("/") && publicBaseUrl
      ? `${publicBaseUrl}${rawUrl}`
      : rawUrl;

  return {
    url,
    label: toText(record?.label),
  };
}

function normalizeOptions(value: unknown) {
  const record = asRecord(value);
  return {
    showLinkInTitle: toBoolean(record?.showLinkInTitle, false),
  };
}

function normalizeCustomFields(value: unknown) {
  return asArray(value).map((field) => {
    const record = asRecord(field) ?? {};
    return {
      id: toText(record.id, createId()),
      icon: toText(record.icon),
      text: toText(record.text ?? record.name ?? record.value),
      link: toText(record.link ?? record.value),
    };
  });
}

function normalizeRoles(value: unknown) {
  return asArray(value).map((role) => {
    const record = asRecord(role) ?? {};
    return {
      id: toText(record.id, createId()),
      position: toText(record.position),
      period: toText(record.period),
      description: toText(record.description),
    };
  });
}

function resolveHidden(
  record: RecordLike | null,
  visibleFallback = true,
): boolean {
  if (!record) return !visibleFallback;
  if (typeof record.hidden === "boolean") return record.hidden;
  if (typeof record.show === "boolean") return !record.show;
  if (typeof record.visible === "boolean") return !record.visible;
  return !visibleFallback;
}

function normalizeSectionBase(section: RecordLike | null, title: string) {
  return {
    title: toText(section?.title ?? section?.name, title),
    columns: toNumber(section?.columns, 1),
    hidden: resolveHidden(section, true),
  };
}

function buildMetadata(
  source: RecordLike,
  publicBaseUrl: string | null,
): RecordLike {
  const metadata = asRecord(source.metadata) ?? {};
  const layout = asRecord(metadata.layout);
  const css = asRecord(metadata.css);
  const page = asRecord(metadata.page);
  const design = asRecord(metadata.design);
  const legacyTheme = asRecord(metadata.theme);
  const legacyTypography = asRecord(metadata.typography);
  const legacyFont = asRecord(legacyTypography?.font);
  const bodyTypography = asRecord(legacyTypography?.body);
  const headingTypography = asRecord(legacyTypography?.heading);
  const fallbackTypography = {
    fontFamily: toText(legacyFont?.family, "Merriweather"),
    fontWeights: normalizeFontWeights(legacyFont?.variants),
    fontSize: clamp(toNumber(legacyFont?.size, 11), 6, 24),
    lineHeight: clamp(toNumber(legacyTypography?.lineHeight, 1.5), 0.5, 4),
  };
  const defaultPage = buildDefaultPageLayout(source.customSections);

  void publicBaseUrl;

  return {
    template: pickTemplate(metadata.template),
    layout: {
      sidebarWidth: toNumber(layout?.sidebarWidth, 35),
      pages: normalizeLayoutPages(
        layout?.pages ?? metadata.layout,
        defaultPage,
      ),
    },
    css: {
      enabled: toBoolean(css?.enabled, toBoolean(css?.visible, false)),
      value: toText(css?.value),
    },
    page: {
      gapX: toNumber(page?.gapX, 24),
      gapY: toNumber(page?.gapY, 24),
      marginX: toNumber(page?.marginX, toNumber(page?.margin, 18)),
      marginY: toNumber(page?.marginY, toNumber(page?.margin, 18)),
      format: VALID_PAGE_FORMATS.has(toText(page?.format))
        ? toText(page?.format)
        : "a4",
      locale: toText(page?.locale, "en-US"),
      hideIcons: toBoolean(
        page?.hideIcons,
        toBoolean(legacyTypography?.hideIcons, false),
      ),
    },
    design: {
      level: {
        icon: toText(asRecord(design?.level)?.icon),
        type: VALID_LEVEL_TYPES.has(toText(asRecord(design?.level)?.type))
          ? toText(asRecord(design?.level)?.type)
          : "hidden",
      },
      colors: {
        primary: toText(
          asRecord(design?.colors)?.primary ?? legacyTheme?.primary,
          "rgba(202, 138, 4, 1)",
        ),
        text: toText(
          asRecord(design?.colors)?.text ?? legacyTheme?.text,
          "rgba(0, 0, 0, 1)",
        ),
        background: toText(
          asRecord(design?.colors)?.background ?? legacyTheme?.background,
          "rgba(255, 255, 255, 1)",
        ),
      },
    },
    typography: {
      body: normalizeTypographyBlock(bodyTypography, fallbackTypography),
      heading: normalizeTypographyBlock(headingTypography, {
        ...fallbackTypography,
        fontSize: clamp(fallbackTypography.fontSize + 1, 6, 24),
      }),
    },
    notes: toText(metadata.notes),
  };
}

export function buildDefaultReactiveResumeDocument(): RecordLike {
  const source = { customSections: [] } satisfies RecordLike;
  return {
    $schema: "https://rxresu.me/schema.json",
    version: "5.0.0",
    picture: defaultPicture(),
    basics: {
      name: "",
      headline: "",
      email: "",
      phone: "",
      location: "",
      website: defaultWebsite(),
      customFields: [],
    },
    summary: {
      ...defaultSectionBase("Summary"),
      content: "",
    },
    sections: {
      profiles: { ...defaultSectionBase("Profiles"), items: [] },
      experience: { ...defaultSectionBase("Experience"), items: [] },
      education: { ...defaultSectionBase("Education"), items: [] },
      projects: { ...defaultSectionBase("Projects"), items: [] },
      skills: { ...defaultSectionBase("Skills"), items: [] },
      languages: { ...defaultSectionBase("Languages"), items: [] },
      interests: { ...defaultSectionBase("Interests"), items: [] },
      awards: { ...defaultSectionBase("Awards"), items: [] },
      certifications: { ...defaultSectionBase("Certifications"), items: [] },
      publications: { ...defaultSectionBase("Publications"), items: [] },
      volunteer: { ...defaultSectionBase("Volunteer"), items: [] },
      references: { ...defaultSectionBase("References"), items: [] },
    },
    customSections: [],
    metadata: buildMetadata(source, null),
  };
}

export function normalizeReactiveResumeV5Document(
  input: unknown,
  options: { requestOrigin?: string | null } = {},
): RecordLike {
  const source = asRecord(input) ?? {};
  const basics = asRecord(source.basics) ?? {};
  const picture = asRecord(source.picture) ?? {};
  const summary = asRecord(source.summary) ?? {};
  const sections = asRecord(source.sections) ?? {};
  const customSections = asArray(source.customSections);
  const defaults = buildDefaultReactiveResumeDocument();
  const publicBaseUrl = resolveTracerPublicBaseUrl({
    requestOrigin: options.requestOrigin ?? null,
  });

  return {
    $schema: toText(source.$schema, "https://rxresu.me/schema.json"),
    version: toText(source.version, "5.0.0"),
    picture: {
      ...defaultPicture(),
      hidden: resolveHidden(picture, true),
      url: normalizeUrl(picture.url, publicBaseUrl).url,
      size: clamp(toNumber(picture.size, 96), 32, 512),
      rotation: clamp(toNumber(picture.rotation, 0), 0, 360),
      aspectRatio: clamp(toNumber(picture.aspectRatio, 1), 0.5, 2.5),
      borderRadius: clamp(toNumber(picture.borderRadius, 0), 0, 100),
      borderColor: toText(
        picture.borderColor,
        toText(asRecord(defaults.picture)?.borderColor),
      ),
      borderWidth: Math.max(0, toNumber(picture.borderWidth, 0)),
      shadowColor: toText(
        picture.shadowColor,
        toText(asRecord(defaults.picture)?.shadowColor),
      ),
      shadowWidth: Math.max(0, toNumber(picture.shadowWidth, 0)),
    },
    basics: {
      name: toText(basics.name),
      headline: toText(basics.headline),
      email: toText(basics.email),
      phone: toText(basics.phone),
      location: toText(basics.location),
      website: normalizeUrl(basics.website, publicBaseUrl),
      customFields: normalizeCustomFields(basics.customFields),
    },
    summary: {
      ...defaultSectionBase("Summary"),
      ...normalizeSectionBase(summary, "Summary"),
      content: toText(summary.content),
    },
    sections: {
      profiles: {
        ...defaultSectionBase("Profiles"),
        ...normalizeSectionBase(asRecord(sections.profiles), "Profiles"),
        items: asArray(asRecord(sections.profiles)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            icon: toText(record.icon),
            network: toText(record.network),
            username: toText(record.username),
            website: normalizeUrl(record.website, publicBaseUrl),
            options: normalizeOptions(record.options),
          };
        }),
      },
      experience: {
        ...defaultSectionBase("Experience"),
        ...normalizeSectionBase(asRecord(sections.experience), "Experience"),
        items: asArray(asRecord(sections.experience)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            company: toText(record.company),
            position: toText(record.position),
            location: toText(record.location),
            period: toText(record.period ?? record.date),
            website: normalizeUrl(record.website ?? record.url, publicBaseUrl),
            description: toText(record.description ?? record.summary),
            roles: normalizeRoles(record.roles),
            options: normalizeOptions(record.options),
          };
        }),
      },
      education: {
        ...defaultSectionBase("Education"),
        ...normalizeSectionBase(asRecord(sections.education), "Education"),
        items: asArray(asRecord(sections.education)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            school: toText(record.school ?? record.institution),
            degree: toText(record.degree ?? record.studyType),
            area: toText(record.area),
            grade: toText(record.grade ?? record.score),
            location: toText(record.location),
            period: toText(record.period ?? record.date),
            website: normalizeUrl(record.website ?? record.url, publicBaseUrl),
            description: toText(record.description ?? record.summary),
            options: normalizeOptions(record.options),
          };
        }),
      },
      projects: {
        ...defaultSectionBase("Projects"),
        ...normalizeSectionBase(asRecord(sections.projects), "Projects"),
        items: asArray(asRecord(sections.projects)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            name: toText(record.name),
            period: toText(record.period ?? record.date),
            website: normalizeUrl(record.website ?? record.url, publicBaseUrl),
            description: toText(record.description ?? record.summary),
            options: normalizeOptions(record.options),
          };
        }),
      },
      skills: {
        ...defaultSectionBase("Skills"),
        ...normalizeSectionBase(asRecord(sections.skills), "Skills"),
        items: asArray(asRecord(sections.skills)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            icon: toText(record.icon),
            name: toText(record.name),
            proficiency: toText(record.proficiency ?? record.description),
            level: toNumber(record.level, 0),
            keywords: asArray(record.keywords).map((entry) => toText(entry)),
          };
        }),
      },
      languages: {
        ...defaultSectionBase("Languages"),
        ...normalizeSectionBase(asRecord(sections.languages), "Languages"),
        items: asArray(asRecord(sections.languages)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            language: toText(record.language ?? record.name),
            fluency: toText(record.fluency ?? record.description),
            level: toNumber(record.level, 0),
          };
        }),
      },
      interests: {
        ...defaultSectionBase("Interests"),
        ...normalizeSectionBase(asRecord(sections.interests), "Interests"),
        items: asArray(asRecord(sections.interests)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            icon: toText(record.icon),
            name: toText(record.name),
            keywords: asArray(record.keywords).map((entry) => toText(entry)),
          };
        }),
      },
      awards: {
        ...defaultSectionBase("Awards"),
        ...normalizeSectionBase(asRecord(sections.awards), "Awards"),
        items: asArray(asRecord(sections.awards)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            title: toText(record.title),
            awarder: toText(record.awarder),
            date: toText(record.date),
            website: normalizeUrl(record.website ?? record.url, publicBaseUrl),
            description: toText(record.description ?? record.summary),
            options: normalizeOptions(record.options),
          };
        }),
      },
      certifications: {
        ...defaultSectionBase("Certifications"),
        ...normalizeSectionBase(
          asRecord(sections.certifications),
          "Certifications",
        ),
        items: asArray(asRecord(sections.certifications)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            title: toText(record.title ?? record.name),
            issuer: toText(record.issuer),
            date: toText(record.date),
            website: normalizeUrl(record.website ?? record.url, publicBaseUrl),
            description: toText(record.description ?? record.summary),
            options: normalizeOptions(record.options),
          };
        }),
      },
      publications: {
        ...defaultSectionBase("Publications"),
        ...normalizeSectionBase(
          asRecord(sections.publications),
          "Publications",
        ),
        items: asArray(asRecord(sections.publications)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            title: toText(record.title ?? record.name),
            publisher: toText(record.publisher),
            date: toText(record.date),
            website: normalizeUrl(record.website ?? record.url, publicBaseUrl),
            description: toText(record.description ?? record.summary),
            options: normalizeOptions(record.options),
          };
        }),
      },
      volunteer: {
        ...defaultSectionBase("Volunteer"),
        ...normalizeSectionBase(asRecord(sections.volunteer), "Volunteer"),
        items: asArray(asRecord(sections.volunteer)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            organization: toText(record.organization),
            location: toText(record.location),
            period: toText(record.period ?? record.date),
            website: normalizeUrl(record.website ?? record.url, publicBaseUrl),
            description: toText(record.description ?? record.summary),
            position: toText(record.position),
            options: normalizeOptions(record.options),
          };
        }),
      },
      references: {
        ...defaultSectionBase("References"),
        ...normalizeSectionBase(asRecord(sections.references), "References"),
        items: asArray(asRecord(sections.references)?.items).map((item) => {
          const record = asRecord(item) ?? {};
          return {
            id: toText(record.id, createId()),
            hidden: resolveHidden(record, true),
            name: toText(record.name),
            position: toText(record.position ?? record.description),
            website: normalizeUrl(record.website ?? record.url, publicBaseUrl),
            phone: toText(record.phone),
            description: toText(record.description ?? record.summary),
            options: normalizeOptions(record.options),
          };
        }),
      },
    },
    customSections: customSections.map((section) =>
      structuredClone(section),
    ) as unknown[],
    metadata: buildMetadata(source, publicBaseUrl),
  };
}

export function convertV4ResumeToReactiveResumeV5Document(
  input: unknown,
  options: { requestOrigin?: string | null } = {},
): RecordLike {
  const parsed = parseV4ResumeData(input);

  return normalizeReactiveResumeV5Document(
    {
      picture: {
        show: !parsed.basics.picture.effects.hidden,
        url: toText(parsed.basics.picture.url),
        size: parsed.basics.picture.size,
        aspectRatio: parsed.basics.picture.aspectRatio,
        borderRadius: parsed.basics.picture.borderRadius,
        borderWidth: parsed.basics.picture.effects.border ? 1 : 0,
      },
      basics: {
        name: parsed.basics.name,
        headline: parsed.basics.headline,
        email: parsed.basics.email,
        phone: parsed.basics.phone,
        location: parsed.basics.location,
        website: {
          label: parsed.basics.url.label,
          url: parsed.basics.url.href,
        },
        customFields: parsed.basics.customFields.map((field) => ({
          id: field.id,
          icon: field.icon,
          text: field.value,
          link: "",
        })),
      },
      summary: {
        title: toText(parsed.sections.summary.name, "Summary"),
        columns: toNumber(parsed.sections.summary.columns, 1),
        hidden: !toBoolean(parsed.sections.summary.visible, true),
        content: parsed.sections.summary.content,
      },
      sections: {
        profiles: {
          title: toText(parsed.sections.profiles.name, "Profiles"),
          columns: toNumber(parsed.sections.profiles.columns, 1),
          hidden: !toBoolean(parsed.sections.profiles.visible, true),
          items: parsed.sections.profiles.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            icon: item.icon,
            network: item.network,
            username: item.username,
            website: { label: item.url.label, url: item.url.href },
            options: defaultOptions(),
          })),
        },
        experience: {
          title: toText(parsed.sections.experience.name, "Experience"),
          columns: toNumber(parsed.sections.experience.columns, 1),
          hidden: !toBoolean(parsed.sections.experience.visible, true),
          items: parsed.sections.experience.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            company: item.company,
            location: item.location,
            position: item.position,
            period: item.date,
            website: { label: item.url.label, url: item.url.href },
            options: defaultOptions(),
            description: item.summary,
            roles: [],
          })),
        },
        education: {
          title: toText(parsed.sections.education.name, "Education"),
          columns: toNumber(parsed.sections.education.columns, 1),
          hidden: !toBoolean(parsed.sections.education.visible, true),
          items: parsed.sections.education.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            school: item.institution,
            area: item.area,
            degree: item.studyType,
            grade: item.score,
            location: "",
            period: item.date,
            website: { label: item.url.label, url: item.url.href },
            options: defaultOptions(),
            description: item.summary,
          })),
        },
        projects: {
          title: toText(parsed.sections.projects.name, "Projects"),
          columns: toNumber(parsed.sections.projects.columns, 1),
          hidden: !toBoolean(parsed.sections.projects.visible, true),
          items: parsed.sections.projects.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            name: item.name,
            period: item.date,
            website: { label: item.url.label, url: item.url.href },
            options: defaultOptions(),
            description: item.summary,
          })),
        },
        skills: {
          title: toText(parsed.sections.skills.name, "Skills"),
          columns: toNumber(parsed.sections.skills.columns, 1),
          hidden: !toBoolean(parsed.sections.skills.visible, true),
          items: parsed.sections.skills.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            icon: "",
            name: item.name,
            proficiency: item.description,
            level: item.level,
            keywords: item.keywords,
          })),
        },
        languages: {
          title: toText(parsed.sections.languages.name, "Languages"),
          columns: toNumber(parsed.sections.languages.columns, 1),
          hidden: !toBoolean(parsed.sections.languages.visible, true),
          items: parsed.sections.languages.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            language: item.name,
            fluency: item.description,
            level: item.level,
          })),
        },
        interests: {
          title: toText(parsed.sections.interests.name, "Interests"),
          columns: toNumber(parsed.sections.interests.columns, 1),
          hidden: !toBoolean(parsed.sections.interests.visible, true),
          items: parsed.sections.interests.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            icon: "",
            name: item.name,
            keywords: item.keywords,
          })),
        },
        awards: {
          title: toText(parsed.sections.awards.name, "Awards"),
          columns: toNumber(parsed.sections.awards.columns, 1),
          hidden: !toBoolean(parsed.sections.awards.visible, true),
          items: parsed.sections.awards.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            title: item.title,
            awarder: item.awarder,
            date: item.date,
            website: { label: item.url.label, url: item.url.href },
            options: defaultOptions(),
            description: item.summary,
          })),
        },
        certifications: {
          title: toText(parsed.sections.certifications.name, "Certifications"),
          columns: toNumber(parsed.sections.certifications.columns, 1),
          hidden: !toBoolean(parsed.sections.certifications.visible, true),
          items: parsed.sections.certifications.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            title: item.name,
            issuer: item.issuer,
            date: item.date,
            website: { label: item.url.label, url: item.url.href },
            options: defaultOptions(),
            description: item.summary,
          })),
        },
        publications: {
          title: toText(parsed.sections.publications.name, "Publications"),
          columns: toNumber(parsed.sections.publications.columns, 1),
          hidden: !toBoolean(parsed.sections.publications.visible, true),
          items: parsed.sections.publications.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            title: item.name,
            publisher: item.publisher,
            date: item.date,
            website: { label: item.url.label, url: item.url.href },
            options: defaultOptions(),
            description: item.summary,
          })),
        },
        volunteer: {
          title: toText(parsed.sections.volunteer.name, "Volunteer"),
          columns: toNumber(parsed.sections.volunteer.columns, 1),
          hidden: !toBoolean(parsed.sections.volunteer.visible, true),
          items: parsed.sections.volunteer.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            organization: item.organization,
            location: item.location,
            period: item.date,
            position: item.position,
            website: { label: item.url.label, url: item.url.href },
            options: defaultOptions(),
            description: item.summary,
          })),
        },
        references: {
          title: toText(parsed.sections.references.name, "References"),
          columns: toNumber(parsed.sections.references.columns, 1),
          hidden: !toBoolean(parsed.sections.references.visible, true),
          items: parsed.sections.references.items.map((item) => ({
            id: item.id,
            hidden: !item.visible,
            name: item.name,
            position: item.description,
            phone: "",
            website: { label: item.url.label, url: item.url.href },
            options: defaultOptions(),
            description: item.summary,
          })),
        },
      },
      customSections: [],
      metadata: parsed.metadata,
    },
    options,
  );
}

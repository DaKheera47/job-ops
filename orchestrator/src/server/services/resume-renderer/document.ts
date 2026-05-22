import { buildDesignResumeJakeDocument } from "@shared/design-resume-jake";
import type { ChatStyleManualLanguage } from "@shared/types";
import type {
  NormalizeResumeJsonOptions,
  ResumeRenderBodySection,
  ResumeRenderDocument,
  ResumeRenderSectionTitles,
} from "./types";

const RESUME_SECTION_TITLES: Record<
  ChatStyleManualLanguage,
  ResumeRenderSectionTitles
> = {
  english: {
    summary: "Summary",
    experience: "Experience",
    education: "Education",
    projects: "Projects",
    skills: "Technical Skills",
  },
  german: {
    summary: "Zusammenfassung",
    experience: "Berufserfahrung",
    education: "Ausbildung",
    projects: "Projekte",
    skills: "Fachliche Kenntnisse",
  },
  french: {
    summary: "Résumé",
    experience: "Expérience",
    education: "Formation",
    projects: "Projets",
    skills: "Compétences techniques",
  },
  spanish: {
    summary: "Resumen",
    experience: "Experiencia",
    education: "Educación",
    projects: "Proyectos",
    skills: "Habilidades técnicas",
  },
};

const SUPPORTED_SECTION_KEYS = [
  "experience",
  "education",
  "projects",
  "skills",
] as const;

const DEFAULT_SECTION_ORDER: readonly string[] = SUPPORTED_SECTION_KEYS;

export function getResumeSectionTitles(
  language: ChatStyleManualLanguage = "english",
): ResumeRenderSectionTitles {
  return RESUME_SECTION_TITLES[language];
}

export function buildResumeRenderDocument(
  resumeJson: Record<string, unknown>,
  options: NormalizeResumeJsonOptions = {},
): ResumeRenderDocument {
  const document = buildDesignResumeJakeDocument(resumeJson);
  const titles = getResumeSectionTitles(options.language);

  const supportedKeys = new Set<string>(SUPPORTED_SECTION_KEYS);
  let sectionOrder: readonly string[] = DEFAULT_SECTION_ORDER;

  const metadata = resumeJson.metadata as Record<string, unknown> | undefined;
  const layout = metadata?.layout as Record<string, unknown> | undefined;
  const pages = layout?.pages as unknown[] | undefined;
  const firstPage = pages?.[0] as Record<string, unknown> | undefined;
  const mainSections = firstPage?.main;
  if (Array.isArray(mainSections)) {
    const filtered = mainSections.filter(
      (key): key is string => typeof key === "string" && supportedKeys.has(key),
    );
    if (filtered.length > 0) {
      sectionOrder = filtered;
    }
  }

  const experienceEntries = document.experience.map((entry) => ({
    title: entry.title,
    subtitle: [entry.subtitle, entry.meta].filter(Boolean).join(" / ") || null,
    date: entry.date,
    bullets: entry.bullets,
    url: entry.url,
  }));

  const educationEntries = document.education.map((entry) => ({
    title: entry.title,
    subtitle: [entry.subtitle, entry.meta].filter(Boolean).join(" / ") || null,
    date: entry.date,
    bullets: entry.bullets,
    url: entry.url,
  }));

  const projectEntries = document.projects.map((entry) => ({
    title: entry.title,
    subtitle: entry.subtitle,
    date: entry.date,
    bullets: entry.bullets,
    url: entry.url,
  }));

  const skillGroups = document.skills.map((group) => ({
    name: group.name,
    keywords: group.keywords,
  }));

  const sectionBuilders: Record<string, () => ResumeRenderBodySection> = {
    experience: () => ({
      key: "experience",
      title: titles.experience,
      kind: "entry",
      entries: experienceEntries,
    }),
    education: () => ({
      key: "education",
      title: titles.education,
      kind: "entry",
      entries: educationEntries,
    }),
    projects: () => ({
      key: "projects",
      title: titles.projects,
      kind: "project",
      entries: projectEntries,
    }),
    skills: () => ({
      key: "skills",
      title: titles.skills,
      kind: "skills",
      entries: [],
      skillGroups,
    }),
  };

  const body: ResumeRenderBodySection[] = sectionOrder
    .map((key) => sectionBuilders[key]?.())
    .filter((section): section is ResumeRenderBodySection => section != null);

  return {
    name: document.name,
    headline: document.headline,
    contactItems: document.contacts,
    summary: document.summary,
    body,
    sectionTitles: titles,
  };
}

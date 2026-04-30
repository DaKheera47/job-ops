import { buildDesignResumeJakeDocument } from "@shared/design-resume-jake";
import type { ChatStyleManualLanguage } from "@shared/types";
import type {
  LatexResumeDocument,
  LatexResumeSectionTitles,
  NormalizeResumeJsonToLatexDocumentOptions,
} from "./types";

const LATEX_RESUME_SECTION_TITLES: Record<
  ChatStyleManualLanguage,
  LatexResumeSectionTitles
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

export function getLatexResumeSectionTitles(
  language: ChatStyleManualLanguage = "english",
): LatexResumeSectionTitles {
  return LATEX_RESUME_SECTION_TITLES[language];
}

export function normalizeResumeJsonToLatexDocument(
  resumeJson: Record<string, unknown>,
  options: NormalizeResumeJsonToLatexDocumentOptions = {},
): LatexResumeDocument {
  const document = buildDesignResumeJakeDocument(resumeJson);

  return {
    name: document.name,
    headline: document.headline,
    contactItems: document.contacts,
    summary: document.summary,
    experience: document.experience.map((entry) => ({
      title: entry.title,
      subtitle:
        [entry.subtitle, entry.meta].filter(Boolean).join(" / ") || null,
      date: entry.date,
      bullets: entry.bullets,
      url: entry.url,
    })),
    education: document.education.map((entry) => ({
      title: entry.title,
      subtitle:
        [entry.subtitle, entry.meta].filter(Boolean).join(" / ") || null,
      date: entry.date,
      bullets: entry.bullets,
      url: entry.url,
    })),
    projects: document.projects.map((entry) => ({
      title: entry.title,
      subtitle: entry.subtitle,
      date: entry.date,
      bullets: entry.bullets,
      url: entry.url,
    })),
    skillGroups: document.skills.map((group) => ({
      name: group.name,
      keywords: group.keywords,
    })),
    sectionTitles: getLatexResumeSectionTitles(options.language),
  };
}

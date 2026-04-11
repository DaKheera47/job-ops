import { buildDesignResumeJakeDocument } from "@shared/design-resume-jake";
import type { LatexResumeDocument } from "./types";

export function normalizeResumeJsonToLatexDocument(
  resumeJson: Record<string, unknown>,
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
  };
}

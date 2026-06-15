import type { ResumeProfile } from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  detectJobDescriptionLanguage,
  detectProfileLanguage,
  detectReactiveResumeV5Language,
  resolveWritingOutputLanguage,
  resolveWritingOutputLanguageForResumeJson,
} from "./output-language";

describe("resolveWritingOutputLanguage", () => {
  it("uses the manual language when manual mode is selected", () => {
    const result = resolveWritingOutputLanguage({
      style: {
        languageMode: "manual",
        manualLanguage: "spanish",
      },
      profile: {},
    });

    expect(result).toEqual({
      language: "spanish",
      source: "manual",
    });
  });

  it("detects supported non-english resume language from profile text", () => {
    const profile: ResumeProfile = {
      basics: {
        summary:
          "Ich entwickle skalierbare Plattformen und arbeite eng mit Produktteams und der Entwicklung zusammen.",
      },
      sections: {
        summary: {
          content:
            "Erfahrung mit verteilten Systemen, APIs und verantwortlicher Lieferung für das Team.",
        },
      },
    };

    expect(detectProfileLanguage(profile)).toBe("german");
    expect(
      resolveWritingOutputLanguage({
        style: {
          languageMode: "match-resume",
          manualLanguage: "english",
        },
        profile,
      }),
    ).toEqual({
      language: "german",
      source: "detected",
    });
  });

  it("falls back to english when resume language detection is weak", () => {
    const result = resolveWritingOutputLanguage({
      style: {
        languageMode: "match-resume",
        manualLanguage: "french",
      },
      profile: {
        basics: {
          headline: "Senior Engineer",
        },
      },
    });

    expect(result).toEqual({
      language: "english",
      source: "fallback",
    });
  });

  it.each([
    [
      "english",
      "We are looking for an engineer with experience building reliable APIs and working with product teams.",
    ],
    [
      "german",
      "Wir suchen eine Person mit Erfahrung in der Entwicklung skalierbarer Plattformen und Verantwortung für APIs.",
    ],
    [
      "french",
      "Nous recherchons une personne avec expérience dans le développement et responsable des plateformes pour les équipes.",
    ],
    [
      "spanish",
      "Buscamos una persona con experiencia en desarrollo, responsable de APIs y colaboración con los equipos.",
    ],
  ] as const)("detects %s from job description text", (language, jobDescription) => {
    expect(detectJobDescriptionLanguage(jobDescription)).toBe(language);
    expect(
      resolveWritingOutputLanguage({
        style: {
          languageMode: "match-job-description",
          manualLanguage: "english",
        },
        profile: {},
        jobDescription,
      }),
    ).toEqual({
      language,
      source: "detected",
    });
  });

  it("falls back to english when job description language detection is weak", () => {
    const result = resolveWritingOutputLanguage({
      style: {
        languageMode: "match-job-description",
        manualLanguage: "french",
      },
      profile: {},
      jobDescription: "Senior platform role with Kubernetes.",
    });

    expect(result).toEqual({
      language: "english",
      source: "fallback",
    });
  });

  it.each([
    [
      "german",
      {
        basics: {
          headline: "Plattformingenieur",
        },
        summary: {
          content:
            "Ich entwickle Plattformen und übernehme Verantwortung für zuverlässige Lieferung.",
        },
        sections: {
          experience: {
            items: [
              {
                hidden: false,
                position: "Entwicklung",
                description:
                  "Erfahrung mit verteilten Systemen und Zusammenarbeit mit Produktteams.",
              },
            ],
          },
        },
      },
    ],
    [
      "french",
      {
        basics: {
          headline: "Ingénieur plateforme",
        },
        summary: {
          content:
            "Je construis des systèmes fiables avec une expérience forte dans le développement.",
        },
        sections: {
          projects: {
            items: [
              {
                hidden: false,
                name: "Plateforme interne",
                description:
                  "Responsable des APIs et du développement pour les équipes produit.",
              },
            ],
          },
        },
      },
    ],
    [
      "spanish",
      {
        basics: {
          headline: "Ingeniera de plataforma",
        },
        summary: {
          content:
            "Lideré el desarrollo de sistemas y tengo experiencia con APIs para los equipos.",
        },
        sections: {
          skills: {
            items: [
              {
                hidden: false,
                name: "Desarrollo",
                keywords: ["responsable", "experiencia", "integración"],
              },
            ],
          },
        },
      },
    ],
  ] as const)("detects %s from Reactive Resume v5 JSON", (language, resumeJson) => {
    expect(detectReactiveResumeV5Language(resumeJson)).toBe(language);
  });

  it("resolves v5 resume language using writing language settings", () => {
    const resumeJson = {
      basics: {
        headline: "Senior Engineer",
      },
      summary: {
        content: "Short profile.",
      },
    };

    expect(
      resolveWritingOutputLanguageForResumeJson({
        style: {
          languageMode: "manual",
          manualLanguage: "french",
        },
        resumeJson,
      }),
    ).toEqual({
      language: "french",
      source: "manual",
    });

    expect(
      resolveWritingOutputLanguageForResumeJson({
        style: {
          languageMode: "match-resume",
          manualLanguage: "french",
        },
        resumeJson,
      }),
    ).toEqual({
      language: "english",
      source: "fallback",
    });

    expect(
      resolveWritingOutputLanguageForResumeJson({
        style: {
          languageMode: "match-job-description",
          manualLanguage: "french",
        },
        resumeJson,
        jobDescription:
          "Wir suchen Erfahrung mit Entwicklung und Verantwortung für APIs.",
      }),
    ).toEqual({
      language: "german",
      source: "detected",
    });
  });
});

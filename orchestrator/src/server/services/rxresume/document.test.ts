import { describe, expect, it } from "vitest";
import {
  buildDefaultReactiveResumeDocument,
  convertV4ResumeToReactiveResumeV5Document,
  normalizeReactiveResumeV5Document,
} from "./document";
import { sampleResume } from "./schema/v4";

describe("rxresume document normalization", () => {
  it("normalizes legacy local drafts into canonical v5 documents", () => {
    const normalized = normalizeReactiveResumeV5Document({
      basics: {
        name: "Legacy User",
        headline: "",
        email: "",
        phone: "",
        location: "",
        website: { label: "", url: "" },
        customFields: [
          { id: "cf-1", icon: "github", text: "GitHub", link: "" },
        ],
      },
      picture: { url: "", show: false },
      summary: {
        title: "Summary",
        columns: 1,
        hidden: false,
        content: "",
      },
      sections: {
        profiles: { title: "Profiles", columns: 1, hidden: false, items: [] },
        experience: {
          title: "Experience",
          columns: 1,
          hidden: false,
          items: [],
        },
        education: { title: "Education", columns: 1, hidden: false, items: [] },
        projects: { title: "Projects", columns: 1, hidden: false, items: [] },
        skills: { title: "Skills", columns: 1, hidden: false, items: [] },
        languages: { title: "Languages", columns: 1, hidden: false, items: [] },
        interests: { title: "Interests", columns: 1, hidden: false, items: [] },
        awards: { title: "Awards", columns: 1, hidden: false, items: [] },
        certifications: {
          title: "Certifications",
          columns: 1,
          hidden: false,
          items: [],
        },
        publications: {
          title: "Publications",
          columns: 1,
          hidden: false,
          items: [],
        },
        volunteer: { title: "Volunteer", columns: 1, hidden: false, items: [] },
        references: {
          title: "References",
          columns: 1,
          hidden: false,
          items: [],
        },
      },
      customSections: [],
      metadata: {
        layout: [[["summary"], ["skills"]]],
      },
    });

    expect((normalized.picture as { hidden?: boolean }).hidden).toBe(true);
    expect(
      (
        (normalized.metadata as Record<string, unknown>).layout as Record<
          string,
          unknown
        >
      ).pages,
    ).toBeInstanceOf(Array);
    expect(
      (
        (
          (
            (normalized.metadata as Record<string, unknown>).layout as Record<
              string,
              unknown
            >
          ).pages as Array<Record<string, unknown>>
        )[0] as Record<string, unknown>
      ).fullWidth,
    ).toBe(false);
    expect((normalized.basics as Record<string, unknown>).customFields).toEqual(
      [{ id: "cf-1", icon: "github", text: "GitHub", link: "" }],
    );
  });

  it("coerces invalid v5 layout fullWidth values into booleans", () => {
    const normalized = normalizeReactiveResumeV5Document({
      metadata: {
        layout: {
          pages: [
            {
              fullWidth: [],
              main: ["summary"],
              sidebar: ["skills"],
            },
          ],
        },
      },
    });

    expect(
      (
        (
          (
            (normalized.metadata as Record<string, unknown>).layout as Record<
              string,
              unknown
            >
          ).pages as Array<Record<string, unknown>>
        )[0] as Record<string, unknown>
      ).fullWidth,
    ).toBe(false);
  });

  it("converts v4 resumes into canonical v5 documents", () => {
    const normalized = convertV4ResumeToReactiveResumeV5Document(sampleResume);
    const defaults = buildDefaultReactiveResumeDocument();

    expect(normalized.$schema).toBe("https://rxresu.me/schema.json");
    expect(normalized.version).toBe("5.0.0");
    expect((normalized.picture as Record<string, unknown>).hidden).toBe(false);
    expect(
      (
        (normalized.metadata as Record<string, unknown>).page as Record<
          string,
          unknown
        >
      ).format,
    ).toBe(
      (
        (defaults.metadata as Record<string, unknown>).page as Record<
          string,
          unknown
        >
      ).format,
    );
  });
});

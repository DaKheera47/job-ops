import { describe, expect, it } from "vitest";
import {
  buildDefaultReactiveResumeDocument,
  convertV4ResumeToReactiveResumeV5Document,
  mergeReactiveResumeV5Content,
  normalizeReactiveResumeV5Document,
} from "./document";
import { sampleResume } from "./schema/v4";

function makeFullV5Document(overrides?: Partial<Record<string, unknown>>) {
  return {
    ...buildDefaultReactiveResumeDocument(),
    ...overrides,
  };
}

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

  it("converts v4 resumes into exact v5 documents", () => {
    const normalized = convertV4ResumeToReactiveResumeV5Document(sampleResume);

    expect(normalized).not.toHaveProperty("$schema");
    expect(normalized).not.toHaveProperty("version");
    expect((normalized.picture as Record<string, unknown>).hidden).toBe(false);
    expect(
      (
        (normalized.metadata as Record<string, unknown>).page as Record<
          string,
          unknown
        >
      ).format,
    ).toBe("a4");
  });

  it("preserves template metadata while overlaying local editable content", () => {
    const merged = mergeReactiveResumeV5Content(
      makeFullV5Document({
        metadata: {
          template: "onyx",
          layout: {
            sidebarWidth: 35,
            pages: [
              {
                fullWidth: false,
                main: ["summary", "experience"],
                sidebar: ["profiles", "skills"],
              },
            ],
          },
          css: { enabled: true, value: "a { text-decoration: underline; }" },
          page: {
            gapX: 4,
            gapY: 6,
            marginX: 20,
            marginY: 20,
            format: "free-form",
            locale: "en-US",
            hideIcons: true,
          },
          design: {
            level: { icon: "address-book-tabs", type: "hidden" },
            colors: {
              primary: "rgba(71, 85, 105, 1)",
              text: "rgba(0, 0, 0, 1)",
              background: "rgba(255, 255, 255, 1)",
            },
          },
          typography: {
            body: {
              fontFamily: "IBM Plex Sans",
              fontWeights: ["400"],
              fontSize: 10,
              lineHeight: 1.75,
            },
            heading: {
              fontFamily: "IBM Plex Sans",
              fontWeights: ["600"],
              fontSize: 12.75,
              lineHeight: 1.75,
            },
          },
          notes: "",
        },
      }),
      makeFullV5Document({
        basics: {
          name: "Shaheer",
          headline: "Software Engineer",
          email: "shaheer@example.com",
          phone: "+44 123",
          location: "Blackpool",
          website: { label: "site", url: "https://example.com" },
          customFields: [],
        },
        summary: {
          title: "Summary",
          columns: 1,
          hidden: false,
          content: "<p>Hello</p>",
        },
      }),
    );

    expect((merged.basics as Record<string, unknown>).name).toBe("Shaheer");
    expect(
      (
        (merged.metadata as Record<string, unknown>).page as Record<
          string,
          unknown
        >
      ).gapX,
    ).toBe(4);
    expect(
      (
        (merged.metadata as Record<string, unknown>).page as Record<
          string,
          unknown
        >
      ).format,
    ).toBe("free-form");
    expect(
      (
        (
          (merged.metadata as Record<string, unknown>).design as Record<
            string,
            unknown
          >
        ).level as Record<string, unknown>
      ).icon,
    ).toBe("address-book-tabs");
    expect(
      (
        (
          (merged.metadata as Record<string, unknown>).typography as Record<
            string,
            unknown
          >
        ).body as Record<string, unknown>
      ).fontSize,
    ).toBe(10);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildDefaultReactiveResumeDocument,
  prepareReactiveResumeV5DocumentForExternalUse,
} from "./document";

describe("prepareReactiveResumeV5DocumentForExternalUse", () => {
  it("wraps plain rich-text fields in HTML paragraphs for Reactive Resume", () => {
    const document = buildDefaultReactiveResumeDocument();
    document.summary = {
      ...(document.summary as Record<string, unknown>),
      content: "Plain summary",
    };
    document.sections = {
      ...(document.sections as Record<string, unknown>),
      experience: {
        title: "Experience",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "experience-1",
            hidden: false,
            company: "Acme",
            position: "Engineer",
            location: "",
            period: "",
            website: { url: "", label: "" },
            description: "Built things",
            roles: [
              {
                id: "role-1",
                position: "Platform",
                period: "",
                description: "Owned APIs",
              },
            ],
          },
        ],
      },
      education: {
        title: "Education",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "education-1",
            hidden: false,
            school: "University",
            degree: "",
            area: "",
            grade: "",
            location: "",
            period: "",
            website: { url: "", label: "" },
            description: "Relevant Modules: Web Apps",
          },
        ],
      },
    };

    const prepared = prepareReactiveResumeV5DocumentForExternalUse(document);
    const sections = prepared.sections as Record<string, any>;

    expect((prepared.summary as Record<string, unknown>).content).toBe(
      "<p>Plain summary</p>",
    );
    expect(sections.experience.items[0].description).toBe(
      "<p>Built things</p>",
    );
    expect(sections.experience.items[0].roles[0].description).toBe(
      "<p>Owned APIs</p>",
    );
    expect(sections.education.items[0].description).toBe(
      "<p>Relevant Modules: Web Apps</p>",
    );
  });

  it("preserves existing HTML and escapes plain text before wrapping", () => {
    const document = buildDefaultReactiveResumeDocument();
    document.summary = {
      ...(document.summary as Record<string, unknown>),
      content: "<p>Already HTML</p>",
    };
    document.sections = {
      ...(document.sections as Record<string, unknown>),
      projects: {
        title: "Projects",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "project-1",
            hidden: false,
            name: "Parser",
            period: "",
            website: { url: "", label: "" },
            description: "Used A&B < C\nThen shipped",
          },
        ],
      },
    };

    const prepared = prepareReactiveResumeV5DocumentForExternalUse(document);
    const sections = prepared.sections as Record<string, any>;

    expect((prepared.summary as Record<string, unknown>).content).toBe(
      "<p>Already HTML</p>",
    );
    expect(sections.projects.items[0].description).toBe(
      "<p>Used A&amp;B &lt; C<br>Then shipped</p>",
    );
  });

  it("prepares custom section rich text without changing local storage shape", () => {
    const document = buildDefaultReactiveResumeDocument();
    document.customSections = [
      {
        id: "custom-1",
        type: "summary",
        title: "More",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "summary-item-1",
            hidden: false,
            content: "Extra note",
          },
        ],
      },
    ];

    const prepared = prepareReactiveResumeV5DocumentForExternalUse(document);
    const customSections = prepared.customSections as Array<
      Record<string, any>
    >;

    expect(customSections[0].items[0].content).toBe("<p>Extra note</p>");
    expect(
      (document.customSections as Array<Record<string, any>>)[0].items[0]
        .content,
    ).toBe("Extra note");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildDefaultReactiveResumeDocument,
  mergeReactiveResumeV5Content,
  prepareReactiveResumeV5DocumentForExternalUse,
} from "./document";
import type { SectionType, V5ResumeData } from "./schema/v5";

const STANDARD_SECTION_TITLES = {
  profiles: "Profiles",
  experience: "Work Experience",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  languages: "Languages",
  interests: "Interests",
  awards: "Awards",
  certifications: "Certifications",
  publications: "Publications",
  volunteer: "Volunteer Experience",
  references: "References",
} satisfies Record<SectionType, string>;

const STANDARD_SECTION_KEYS = Object.keys(
  STANDARD_SECTION_TITLES,
) as SectionType[];

function buildV5Document(): V5ResumeData {
  return buildDefaultReactiveResumeDocument() as V5ResumeData;
}

function mergeV5Documents(
  upstream: V5ResumeData,
  local: V5ResumeData,
): V5ResumeData {
  return mergeReactiveResumeV5Content(upstream, local) as V5ResumeData;
}

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

describe("mergeReactiveResumeV5Content", () => {
  it("restores blank local titles from the upstream Reactive Resume document", () => {
    const upstream = buildV5Document();
    const local = buildV5Document();

    upstream.summary.title = "Professional Summary";
    local.summary.title = "   ";
    local.summary.content = "Locally generated summary";

    STANDARD_SECTION_KEYS.forEach((key, index) => {
      upstream.sections[key].title = STANDARD_SECTION_TITLES[key];

      // Hem boş string hem yalnızca boşluktan oluşan başlıkları sınıyoruz.
      local.sections[key].title = index % 2 === 0 ? "" : "   ";
    });

    const merged = mergeV5Documents(upstream, local);

    expect(merged.summary.title).toBe("Professional Summary");
    expect(merged.summary.content).toBe("Locally generated summary");

    for (const key of STANDARD_SECTION_KEYS) {
      expect(merged.sections[key].title).toBe(STANDARD_SECTION_TITLES[key]);
    }
  });

  it("preserves local section data while filling only its missing title", () => {
    const upstream = buildV5Document();
    const local = buildV5Document();

    upstream.sections.experience.title = "Work History";

    local.sections.experience.title = "";
    local.sections.experience.columns = 2;
    local.sections.experience.hidden = true;
    local.sections.experience.items = [
      {
        id: "local-experience",
        hidden: false,
        company: "Local Company",
        position: "Software Engineer",
        location: "London",
        period: "2025 - Present",
        website: { url: "", label: "" },
        description: "Built important software.",
        roles: [],
      },
    ];
    const localExperience = structuredClone(local.sections.experience);

    const merged = mergeV5Documents(upstream, local);

    expect(merged.sections.experience).toEqual({
      ...localExperience,
      title: "Work History",
    });
  });

  it("keeps non-empty local titles and does not mutate either input", () => {
    const upstream = buildV5Document();
    const local = buildV5Document();

    upstream.summary.title = "Upstream Summary";
    local.summary.title = "About Me";

    upstream.sections.experience.title = "Upstream Experience";
    local.sections.experience.title = "My Career";

    const upstreamBefore = structuredClone(upstream);
    const localBefore = structuredClone(local);

    const merged = mergeV5Documents(upstream, local);

    expect(merged.summary.title).toBe("About Me");
    expect(merged.sections.experience.title).toBe("My Career");

    merged.summary.content = "Mutated merged summary";
    merged.sections.experience.columns = 3;
    merged.metadata.layout.pages[0].main.push("mutated");
    merged.customSections.push({
      id: "merged-only",
      type: "summary",
      title: "Merged only",
      columns: 1,
      hidden: false,
      items: [],
    });

    // Sonucun nested alanları da input'lardan bağımsız olmalı.
    expect(upstream).toEqual(upstreamBefore);
    expect(local).toEqual(localBefore);
  });

  it("keeps a blank local title when the upstream title is also blank", () => {
    const upstream = buildV5Document();
    const local = buildV5Document();

    upstream.summary.title = " \t ";
    local.summary.title = "";
    upstream.sections.education.title = "\n";
    local.sections.education.title = "  ";

    const merged = mergeV5Documents(upstream, local);

    expect(merged.summary.title).toBe("");
    expect(merged.sections.education.title).toBe("  ");
  });

  it("preserves upstream metadata and local custom sections unchanged", () => {
    const upstream = buildV5Document();
    const local = buildV5Document();

    upstream.metadata.template = "pikachu";
    upstream.metadata.layout.sidebarWidth = 42;
    upstream.metadata.layout.pages[0] = {
      fullWidth: true,
      main: ["summary", "experience"],
      sidebar: ["skills"],
    };
    upstream.customSections = [
      {
        id: "custom-section",
        type: "summary",
        title: "Upstream Custom Title",
        columns: 1,
        hidden: false,
        items: [],
      },
    ];
    local.customSections = [
      {
        id: "custom-section",
        type: "summary",
        title: " ",
        columns: 2,
        hidden: true,
        items: [
          {
            id: "custom-item",
            hidden: false,
            content: "Local custom content",
          },
        ],
      },
    ];

    const expectedMetadata = structuredClone(upstream.metadata);
    const expectedCustomSections = structuredClone(local.customSections);

    const merged = mergeV5Documents(upstream, local);

    expect(merged.metadata).toEqual(expectedMetadata);
    expect(merged.customSections).toEqual(expectedCustomSections);
  });
});

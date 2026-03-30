import { describe, expect, it } from "vitest";
import { normalizePreparedResumeToLatexDocument } from "./normalize";

describe("normalizePreparedResumeToLatexDocument", () => {
  it("maps visible v4 resume data into the LaTeX document model", () => {
    const document = normalizePreparedResumeToLatexDocument({
      mode: "v4",
      projectCatalog: [],
      selectedProjectIds: ["project-1"],
      data: {
        basics: {
          name: "Jane Doe",
          headline: "Senior Software Engineer",
          email: "jane@example.com",
          phone: "123-456-7890",
          url: {
            href: "https://jane.dev",
            label: "Portfolio",
          },
        },
        sections: {
          summary: {
            id: "summary",
            visible: true,
            content:
              "<p>Builds resilient backend systems.</p><p>Enjoys platform work.</p>",
          },
          profiles: {
            id: "profiles",
            visible: true,
            items: [
              {
                id: "profile-1",
                visible: true,
                network: "GitHub",
                username: "janedoe",
                url: {
                  href: "https://github.com/janedoe",
                  label: "GitHub",
                },
              },
            ],
          },
          experience: {
            id: "experience",
            visible: true,
            items: [
              {
                id: "exp-1",
                visible: true,
                company: "Acme",
                position: "Platform Engineer",
                location: "Remote",
                date: "2023 -- Present",
                summary:
                  "<ul><li>Built queue-backed workflow services</li><li>Improved API reliability</li></ul>",
                url: {
                  href: "https://acme.example.com",
                  label: "Acme",
                },
              },
            ],
          },
          education: {
            id: "education",
            visible: true,
            items: [
              {
                id: "edu-1",
                visible: true,
                institution: "State University",
                studyType: "BSc",
                area: "Computer Science",
                date: "2016 -- 2020",
                summary: "",
                score: "First Class",
                url: {
                  href: "https://state.example.edu",
                  label: "State University",
                },
              },
            ],
          },
          projects: {
            id: "projects",
            visible: true,
            items: [
              {
                id: "project-1",
                visible: true,
                name: "Workflow UI",
                description: "Internal operations dashboard",
                date: "2024",
                summary:
                  "<ul><li>Shipped React + TypeScript interface</li><li>Reduced operator toil</li></ul>",
                keywords: ["React", "TypeScript"],
                url: {
                  href: "https://projects.example.com/workflow-ui",
                  label: "Workflow UI",
                },
              },
              {
                id: "project-2",
                visible: false,
                name: "Hidden Project",
                description: "Should not render",
                date: "2023",
                summary: "",
                keywords: [],
                url: {
                  href: "https://projects.example.com/hidden",
                  label: "Hidden Project",
                },
              },
            ],
          },
          skills: {
            id: "skills",
            visible: true,
            items: [
              {
                id: "skill-1",
                visible: true,
                name: "Backend",
                description: "",
                level: 3,
                keywords: ["Node.js", "TypeScript", "PostgreSQL"],
              },
            ],
          },
        },
      },
    });

    expect(document.name).toBe("Jane Doe");
    expect(document.headline).toBe("Senior Software Engineer");
    expect(document.contactItems).toEqual([
      { text: "123-456-7890" },
      { text: "jane@example.com", url: "mailto:jane@example.com" },
      { text: "Portfolio", url: "https://jane.dev" },
      { text: "GitHub", url: "https://github.com/janedoe" },
    ]);
    expect(document.summary).toBe(
      "Builds resilient backend systems. Enjoys platform work.",
    );
    expect(document.experience).toEqual([
      {
        title: "Acme",
        subtitle: "Platform Engineer | Remote",
        secondaryTitle: null,
        secondarySubtitle: null,
        date: "2023 -- Present",
        bullets: [
          "Built queue-backed workflow services",
          "Improved API reliability",
        ],
        url: "https://acme.example.com",
        linkLabel: "Acme",
      },
    ]);
    expect(document.education[0]?.subtitle).toBe("BSc in Computer Science");
    expect(document.education[0]?.bullets).toEqual(["First Class"]);
    expect(document.projects).toHaveLength(1);
    expect(document.projects[0]?.subtitle).toBe("React, TypeScript");
    expect(document.projects[0]?.bullets).toEqual([
      "Shipped React + TypeScript interface",
      "Reduced operator toil",
    ]);
    expect(document.skillGroups).toEqual([
      {
        name: "Backend",
        keywords: ["Node.js", "TypeScript", "PostgreSQL"],
      },
    ]);
  });

  it("maps v5 summary, links, and hidden items correctly", () => {
    const document = normalizePreparedResumeToLatexDocument({
      mode: "v5",
      projectCatalog: [],
      selectedProjectIds: ["project-1"],
      data: {
        basics: {
          name: "Taylor Smith",
          headline: "Staff Engineer",
          email: "taylor@example.com",
          phone: "",
          location: "",
          website: {
            url: "https://taylor.dev",
            label: "Portfolio",
          },
          customFields: [],
        },
        summary: {
          title: "Summary",
          columns: 1,
          hidden: false,
          content: "Builds observable systems for operations-heavy teams.",
        },
        sections: {
          projects: {
            title: "Projects",
            columns: 1,
            hidden: false,
            items: [
              {
                id: "project-1",
                hidden: false,
                name: "Tracer Links",
                period: "2025",
                description: "Readable outbound tracking links",
                website: {
                  url: "https://jobops.example/cv/acme-ab",
                  label: "Tracer Links",
                },
              },
              {
                id: "project-2",
                hidden: true,
                name: "Hidden",
                period: "2024",
                description: "Should stay hidden",
                website: {
                  url: "https://example.com/hidden",
                  label: "Hidden",
                },
              },
            ],
          },
          skills: {
            title: "Skills",
            columns: 1,
            hidden: false,
            items: [
              {
                id: "skill-1",
                hidden: false,
                icon: "",
                name: "Platform",
                proficiency: "",
                level: 0,
                keywords: ["Observability", "Queues"],
              },
            ],
          },
        },
        picture: {},
        customSections: [],
        metadata: {},
      },
    });

    expect(document.name).toBe("Taylor Smith");
    expect(document.contactItems).toEqual([
      { text: "taylor@example.com", url: "mailto:taylor@example.com" },
      { text: "Portfolio", url: "https://taylor.dev" },
    ]);
    expect(document.summary).toBe(
      "Builds observable systems for operations-heavy teams.",
    );
    expect(document.projects).toHaveLength(1);
    expect(document.projects[0]).toMatchObject({
      title: "Tracer Links",
      date: "2025",
      bullets: ["Readable outbound tracking links"],
      url: "https://jobops.example/cv/acme-ab",
    });
  });
});

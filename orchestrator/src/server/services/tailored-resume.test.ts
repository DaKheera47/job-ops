import { describe, expect, it } from "vitest";
import {
  applyTailoredResumeArtifact,
  createJobDescriptionHash,
  createTailoredResumeArtifact,
  createTailoringSourceHash,
  extractTailoringSource,
  parseValidTailoredResumeArtifact,
  renderTailoredBullets,
  validateTailoringData,
} from "./tailored-resume";

const sourceResume = () => ({
  basics: { headline: "Software Engineer" },
  summary: { content: "Builds reliable services.", hidden: false },
  sections: {
    skills: {
      hidden: false,
      items: [
        {
          id: "skill-1",
          name: "Backend",
          proficiency: "Advanced",
          level: 4,
          keywords: ["TypeScript"],
          hidden: false,
        },
      ],
    },
    experience: {
      hidden: false,
      items: [
        {
          id: "experience-1",
          company: "Example Labs",
          position: "Engineer",
          location: "Remote",
          period: "2022 - 2024",
          description: "<p>Contributed to a pilot used by 25 teams.</p>",
          hidden: false,
          roles: [],
        },
      ],
    },
    projects: {
      hidden: false,
      items: [
        {
          id: "project-1",
          name: "Service Prototype",
          period: "2024",
          description: "Built a prototype API with TypeScript.",
          hidden: true,
        },
      ],
    },
  },
});

const response = () => ({
  headline: "Platform Engineer",
  summary: "Engineer focused on reliable APIs.",
  skills: [{ name: "Backend", keywords: ["TypeScript"] }],
  experience: [
    {
      id: "experience-1",
      bullets: ["Contributed to a pilot used by 25 teams."],
    },
  ],
  projects: [
    {
      id: "project-1",
      bullets: ["Built a TypeScript API prototype."],
    },
  ],
});

describe("source-linked resume tailoring", () => {
  it("reads Reactive Resume v5 and legacy aliases consistently", () => {
    const v5 = extractTailoringSource(sourceResume());
    const legacy = extractTailoringSource({
      basics: {
        label: "Software Engineer",
        summary: "Builds reliable services.",
      },
      sections: {
        summary: { content: "Builds reliable services.", visible: true },
        skills: {
          visible: true,
          items: [
            {
              name: "Backend",
              description: "Advanced",
              level: 4,
              keywords: ["TypeScript"],
              visible: true,
            },
          ],
        },
        experience: {
          visible: true,
          items: [
            {
              id: "experience-1",
              company: "Example Labs",
              position: "Engineer",
              location: "Remote",
              date: "2022 - 2024",
              summary: "Contributed to a pilot used by 25 teams.",
              visible: true,
              roles: [],
            },
          ],
        },
        projects: {
          visible: true,
          items: [
            {
              id: "project-1",
              name: "Service Prototype",
              date: "2024",
              summary: "Built a prototype API with TypeScript.",
              visible: false,
            },
          ],
        },
      },
    });

    expect(v5).toEqual(legacy);
    expect(v5.experience[0].description).toContain("pilot used by 25 teams");
    expect(v5.projects[0].visible).toBe(false);
  });

  it("rejects unknown and duplicate source IDs", () => {
    expect(
      validateTailoringData(
        {
          ...response(),
          experience: [{ id: "unknown", bullets: ["Built APIs."] }],
        },
        sourceResume(),
      ).error,
    ).toContain("unknown id");

    expect(
      validateTailoringData(
        {
          ...response(),
          projects: [
            { id: "project-1", bullets: ["Built an API prototype."] },
            { id: "project-1", bullets: ["Built a service prototype."] },
          ],
        },
        sourceResume(),
      ).error,
    ).toContain("duplicate id");
  });

  it("drops invented numbers, preserves sourced numbers, and fails with no valid experience", () => {
    const mixed = validateTailoringData(
      {
        ...response(),
        experience: [
          {
            id: "experience-1",
            bullets: [
              "Scaled the service to 100 teams.",
              "Contributed to the pilot used by 25 teams.",
            ],
          },
        ],
      },
      sourceResume(),
    );

    expect(mixed.data?.experience[0].bullets).toEqual([
      "Contributed to the pilot used by 25 teams.",
    ]);
    expect(
      validateTailoringData(
        {
          ...response(),
          experience: [
            { id: "experience-1", bullets: ["Scaled to 100 teams."] },
          ],
        },
        sourceResume(),
      ).error,
    ).toContain("no valid source-linked experience");
  });

  it("invalidates artifacts when the source or job description changes", () => {
    const validated = validateTailoringData(response(), sourceResume()).data;
    expect(validated).toBeDefined();
    const artifact = createTailoredResumeArtifact(
      validated!,
      sourceResume(),
      "Build platform APIs",
      "2026-01-01T00:00:00.000Z",
    );

    expect(
      parseValidTailoredResumeArtifact(
        JSON.stringify(artifact),
        sourceResume(),
        "Build platform APIs",
      ),
    ).toEqual(artifact);
    expect(
      parseValidTailoredResumeArtifact(
        JSON.stringify(artifact),
        sourceResume(),
        "Build data pipelines",
      ),
    ).toBeNull();

    const changedResume = sourceResume();
    changedResume.sections.experience.items[0].description =
      "Contributed to an ongoing internal pilot.";
    expect(
      parseValidTailoredResumeArtifact(
        JSON.stringify(artifact),
        changedResume,
        "Build platform APIs",
      ),
    ).toBeNull();
    expect(createTailoringSourceHash(changedResume)).not.toBe(
      artifact.sourceHash,
    );
    expect(createJobDescriptionHash("Build data pipelines")).not.toBe(
      artifact.jobDescriptionHash,
    );
    expect(
      parseValidTailoredResumeArtifact("{", sourceResume(), "Build APIs"),
    ).toBeNull();
  });

  it("applies escaped HTML lists by stable ID without mutating the base resume", () => {
    const base = sourceResume();
    const workingCopy = structuredClone(base);
    const artifact = {
      version: 1 as const,
      sourceHash: "a".repeat(64),
      jobDescriptionHash: "b".repeat(64),
      generatedAt: "2026-01-01T00:00:00.000Z",
      experience: [
        {
          id: "experience-1",
          bullets: ['Improved A < B & called it "safe".'],
        },
      ],
      projects: [{ id: "project-1", bullets: ["Kept the prototype."] }],
    };

    applyTailoredResumeArtifact(workingCopy, artifact);

    expect(base.sections.experience.items[0].description).toContain("<p>");
    expect(workingCopy.sections.experience.items[0].description).toBe(
      '<ul><li>Improved A &lt; B &amp; called it &quot;safe&quot;.</li></ul>',
    );
    expect(workingCopy.sections.projects.items[0].description).toBe(
      "<ul><li>Kept the prototype.</li></ul>",
    );
    expect(renderTailoredBullets(["A > B"])).toBe(
      "<ul><li>A &gt; B</li></ul>",
    );
  });
});

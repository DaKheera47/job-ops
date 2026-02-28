import { createJob } from "@shared/testing/factories.js";
import { describe, expect, it } from "vitest";
import { buildReadyPanelGoogleDorks } from "./ready-panel-google-dorks";

describe("buildReadyPanelGoogleDorks", () => {
  it("returns three links from employer, title, and skills", () => {
    const links = buildReadyPanelGoogleDorks(
      createJob({
        employer: "HP",
        title: "Frontend Engineer",
        skills: "Wolf Security, React, TypeScript",
      }),
    );

    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({
      query: 'site:linkedin.com/in "HP" "Wolf Security" "React"',
      label: "LinkedIn profiles with HP, Wolf Security, and React in them",
    });
    expect(links[1]).toMatchObject({
      query: 'site:github.com "HP" "Wolf Security" "React"',
      label: "GitHub pages with HP, Wolf Security, and React in them",
    });
    expect(links[2]).toMatchObject({
      query: '"HP" "Frontend Engineer" "Wolf Security"',
      label:
        "Web results with HP, Frontend Engineer, and Wolf Security in them",
    });
    expect(links[0]?.href).toContain(
      encodeURIComponent('site:linkedin.com/in "HP" "Wolf Security" "React"'),
    );
  });

  it("falls back to tailored skills when raw skills are absent", () => {
    const links = buildReadyPanelGoogleDorks(
      createJob({
        employer: "Acme",
        title: "Backend Engineer",
        skills: null,
        tailoredSkills: JSON.stringify(["Node.js", "TypeScript"]),
      }),
    );

    expect(links[0]?.query).toBe(
      'site:linkedin.com/in "Acme" "Node.js" "TypeScript"',
    );
  });

  it("deduplicates repeated keywords and excludes employer matches", () => {
    const links = buildReadyPanelGoogleDorks(
      createJob({
        employer: "Acme",
        skills: "Acme, React, react, TypeScript, TypeScript",
      }),
    );

    expect(links[0]?.query).toBe(
      'site:linkedin.com/in "Acme" "React" "TypeScript"',
    );
    expect(links[1]?.query).toBe('site:github.com "Acme" "React" "TypeScript"');
  });

  it("returns no links when employer and usable keywords are missing", () => {
    const links = buildReadyPanelGoogleDorks(
      createJob({
        employer: "",
        skills: null,
        tailoredSkills: null,
      }),
    );

    expect(links).toEqual([]);
  });
});

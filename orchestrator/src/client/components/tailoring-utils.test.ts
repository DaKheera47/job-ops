import { describe, expect, it } from "vitest";
import { parseTailoredSkills } from "./tailoring-utils";

describe("parseTailoredSkills", () => {
  it("parses object-based tailored skills payload", () => {
    const parsed = parseTailoredSkills(
      JSON.stringify([
        { name: "Backend", keywords: ["Node.js", " TypeScript "] },
      ]),
    );

    expect(parsed).toEqual([
      { name: "Backend", keywords: ["Node.js", "TypeScript"] },
    ]);
  });

  it("maps legacy string arrays into a default skills group", () => {
    const parsed = parseTailoredSkills(
      JSON.stringify(["React", " TypeScript ", "", "Vitest"]),
    );

    expect(parsed).toEqual([
      { name: "Skills", keywords: ["React", "TypeScript", "Vitest"] },
    ]);
  });

  it("keeps object groups and legacy string values in mixed arrays", () => {
    const parsed = parseTailoredSkills(
      JSON.stringify([
        { name: "Platform", keywords: ["APIs"] },
        "Observability",
      ]),
    );

    expect(parsed).toEqual([
      { name: "Platform", keywords: ["APIs"] },
      { name: "Skills", keywords: ["Observability"] },
    ]);
  });

  it("returns an empty list for invalid or non-array JSON", () => {
    expect(parseTailoredSkills("{")).toEqual([]);
    expect(parseTailoredSkills(JSON.stringify({ name: "Backend" }))).toEqual(
      [],
    );
  });
});

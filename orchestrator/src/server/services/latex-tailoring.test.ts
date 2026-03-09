import { describe, expect, it } from "vitest";
import {
  extractKeywords,
  reorderByKeywordRelevance,
  reorderLatexItemizeBullets,
  reorderLatexSkillLists,
  scoreTextRelevance,
} from "./latex-tailoring";

describe("latex-tailoring", () => {
  it("extracts and prioritizes meaningful keywords", () => {
    const keywords = extractKeywords(
      "Senior backend role using TypeScript, Node.js, GraphQL and AWS. TypeScript experience required.",
      6,
    );

    expect(keywords).toContain("typescript");
    expect(keywords).toContain("node.js");
    expect(keywords).toContain("graphql");
    expect(keywords).toContain("aws");
    expect(keywords[0]).toBe("typescript");
  });

  it("scores text relevance based on keyword matches", () => {
    const keywords = ["typescript", "node.js", "aws"];
    const high = scoreTextRelevance(
      "Built TypeScript APIs on Node.js with AWS deployment.",
      keywords,
    );
    const low = scoreTextRelevance(
      "Designed static marketing pages with CSS and HTML.",
      keywords,
    );

    expect(high).toBeGreaterThan(low);
  });

  it("reorders generic entries by keyword relevance", () => {
    const items = [
      "Built design systems in Figma.",
      "Implemented Node.js services with TypeScript.",
      "Managed QA spreadsheets and release notes.",
    ];
    const reordered = reorderByKeywordRelevance(
      items,
      (item) => item,
      ["typescript", "node.js"],
    );

    expect(reordered[0]).toContain("TypeScript");
    expect(reordered[1]).toContain("Figma");
  });

  it("reorders itemize bullets while preserving itemize structure", () => {
    const template = String.raw`\begin{itemize}
\item Built dashboards with charts.
\item Implemented TypeScript backend services.
\item Maintained documentation.
\end{itemize}`;

    const reordered = reorderLatexItemizeBullets(template, [
      "typescript",
      "backend",
    ]);

    const items = reordered
      .split("\n")
      .filter((line) => line.trim().startsWith("\\item"));
    expect(items[0]).toContain("TypeScript backend");
    expect(reordered).toContain("\\begin{itemize}");
    expect(reordered).toContain("\\end{itemize}");
  });

  it("reorders skills list entries for skills/technology lines", () => {
    const template = "Technical Skills: React, TypeScript, CSS, Node.js\\\\";
    const reordered = reorderLatexSkillLists(template, [
      "typescript",
      "node.js",
    ]);

    expect(reordered).toContain(
      "Technical Skills: TypeScript, Node.js, React, CSS\\\\",
    );
  });
});

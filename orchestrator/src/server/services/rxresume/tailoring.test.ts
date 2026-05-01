import { describe, expect, it } from "vitest";
import { extractProjectsFromResume } from "./tailoring";

describe("rxresume tailoring", () => {
  it("strips html from project catalog descriptions", () => {
    const { catalog, selectionItems } = extractProjectsFromResume({
      sections: {
        projects: {
          items: [
            {
              id: "p1",
              name: "Analytics",
              description:
                "<ul><li><p><strong>Built analytics</strong> using FastAPI.</p></li></ul>",
              hidden: false,
              period: "2024",
            },
          ],
        },
      },
    });

    expect(catalog[0].description).toBe("Built analytics using FastAPI.");
    expect(selectionItems[0].summaryText).toBe(
      "Built analytics using FastAPI.",
    );
  });
});

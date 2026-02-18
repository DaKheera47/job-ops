import { createJob } from "@shared/testing/factories.js";
import { describe, expect, it } from "vitest";
import {
  computeJobMatchScore,
  groupJobsForCommandBar,
} from "./JobCommandBar.utils";

describe("JobCommandBar score helpers", () => {
  it("returns zero when no title, employer, or location matches", () => {
    const score = computeJobMatchScore(
      createJob({
        title: "Backend Engineer",
        employer: "Acme",
        location: "London",
      }),
      "kubernetes",
    );

    expect(score).toBe(0);
  });

  it("keeps only relevant matches when a query is provided", () => {
    const grouped = groupJobsForCommandBar(
      [
        createJob({
          id: "no-match",
          title: "Visual Designer",
          employer: "Studio Co",
          discoveredAt: "2025-02-01T00:00:00Z",
        }),
        createJob({
          id: "fuzzy",
          title: "Backender Engineer",
          employer: "Platform Co",
          discoveredAt: "2025-01-02T00:00:00Z",
        }),
        createJob({
          id: "exact",
          title: "Backend",
          employer: "Infra Co",
          discoveredAt: "2025-01-01T00:00:00Z",
        }),
      ],
      "backend",
    );

    expect(grouped.ready.map((job) => job.id)).toEqual(["exact", "fuzzy"]);
  });

  it("filters out weak fuzzy matches below the relevance floor", () => {
    const grouped = groupJobsForCommandBar(
      [
        createJob({
          id: "weak-fuzzy",
          title: "Backend Engineer",
          employer: "Platform Co",
          discoveredAt: "2025-01-02T00:00:00Z",
        }),
      ],
      "bde",
    );

    expect(grouped.ready).toEqual([]);
  });
});

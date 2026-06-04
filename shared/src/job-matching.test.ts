import { describe, expect, it } from "vitest";
import { deduplicateJobsByTitleAndEmployer } from "./job-matching";

function makeJob(
  overrides: Partial<{
    source: string;
    title: string;
    employer: string;
    jobUrl: string;
    location: string | undefined;
    salary: string | undefined;
    jobDescription: string | undefined;
    sourceJobId: string | undefined;
  }>,
) {
  return {
    source: "indeed" as const,
    title: "Software Engineer",
    employer: "Acme Corp",
    jobUrl: `https://example.com/${Math.random()}`,
    ...overrides,
  };
}

describe("deduplicateJobsByTitleAndEmployer", () => {
  it("returns an empty list unchanged", () => {
    expect(deduplicateJobsByTitleAndEmployer([])).toEqual([]);
  });

  it("returns a single job unchanged", () => {
    const job = makeJob({ title: "Frontend Engineer", employer: "Globex" });
    const result = deduplicateJobsByTitleAndEmployer([job]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(job);
  });

  it("merges exact title + employer duplicates into one entry", () => {
    const first = makeJob({
      title: "Backend Engineer",
      employer: "NRT Technology Corp",
      jobUrl: "https://board-a.com/job/1",
    });
    const second = makeJob({
      title: "Backend Engineer",
      employer: "NRT Technology Corp",
      jobUrl: "https://board-b.com/job/2",
    });

    const result = deduplicateJobsByTitleAndEmployer([first, second]);
    expect(result).toHaveLength(1);
    // First-seen URL is canonical
    expect(result[0].jobUrl).toBe("https://board-a.com/job/1");
  });

  it("merges employer punctuation variants (dot, pipe)", () => {
    const first = makeJob({
      title: "Backend Engineer",
      employer: "NRT Technology Corp | Las Vegas, NV, US",
      jobUrl: "https://board-a.com/job/1",
    });
    const second = makeJob({
      title: "Backend Engineer",
      employer: "NRT Technology Corp. | Las Vegas, NV",
      jobUrl: "https://board-b.com/job/2",
    });

    const result = deduplicateJobsByTitleAndEmployer([first, second]);
    expect(result).toHaveLength(1);
  });

  it("merges employer suffix variants (Ltd vs Limited)", () => {
    const first = makeJob({
      title: "Platform Engineer",
      employer: "Acme Ltd",
      jobUrl: "https://board-a.com/job/1",
    });
    const second = makeJob({
      title: "Platform Engineer",
      employer: "Acme Limited",
      jobUrl: "https://board-b.com/job/2",
    });

    const result = deduplicateJobsByTitleAndEmployer([first, second]);
    expect(result).toHaveLength(1);
  });

  it("keeps both jobs when employers differ significantly", () => {
    const first = makeJob({ title: "Backend Engineer", employer: "Acme Labs" });
    const second = makeJob({
      title: "Backend Engineer",
      employer: "Globex Inc",
    });

    const result = deduplicateJobsByTitleAndEmployer([first, second]);
    expect(result).toHaveLength(2);
  });

  it("keeps both jobs when titles differ significantly", () => {
    const first = makeJob({ title: "Backend Engineer", employer: "Acme Labs" });
    const second = makeJob({
      title: "Product Designer",
      employer: "Acme Labs",
    });

    const result = deduplicateJobsByTitleAndEmployer([first, second]);
    expect(result).toHaveLength(2);
  });

  it("merges location from first and salary from second into one entry", () => {
    const first = makeJob({
      title: "Backend Engineer",
      employer: "Acme Labs",
      jobUrl: "https://board-a.com/job/1",
      location: "Las Vegas, NV",
      salary: undefined,
    });
    const second = makeJob({
      title: "Backend Engineer",
      employer: "Acme Labs",
      jobUrl: "https://board-b.com/job/2",
      location: undefined,
      salary: "$120,000",
    });

    const result = deduplicateJobsByTitleAndEmployer([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0].location).toBe("Las Vegas, NV");
    expect(result[0].salary).toBe("$120,000");
  });

  it("retains jobDescription when only one duplicate has it", () => {
    const withDesc = makeJob({
      title: "Backend Engineer",
      employer: "Acme Labs",
      jobUrl: "https://board-a.com/job/1",
      jobDescription: "A great role building APIs.",
    });
    const withoutDesc = makeJob({
      title: "Backend Engineer",
      employer: "Acme Labs",
      jobUrl: "https://board-b.com/job/2",
      jobDescription: undefined,
    });

    // First listing has description
    const result1 = deduplicateJobsByTitleAndEmployer([withDesc, withoutDesc]);
    expect(result1[0].jobDescription).toBe("A great role building APIs.");

    // Second listing has description — should still be merged in
    const result2 = deduplicateJobsByTitleAndEmployer([withoutDesc, withDesc]);
    expect(result2[0].jobDescription).toBe("A great role building APIs.");
  });

  it("merges sourceJobId from second when first lacks it", () => {
    const first = makeJob({
      title: "Data Engineer",
      employer: "Acme Labs",
      jobUrl: "https://board-a.com/job/1",
      sourceJobId: undefined,
    });
    const second = makeJob({
      title: "Data Engineer",
      employer: "Acme Labs",
      jobUrl: "https://board-b.com/job/2",
      sourceJobId: "ext-42",
    });

    const result = deduplicateJobsByTitleAndEmployer([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0].sourceJobId).toBe("ext-42");
  });

  it("handles three-way duplicates, merging all into one entry", () => {
    const jobs = [
      makeJob({
        title: "SRE Engineer",
        employer: "Acme Labs",
        jobUrl: "https://board-a.com/job/1",
        location: "Remote",
      }),
      makeJob({
        title: "SRE Engineer",
        employer: "Acme Labs",
        jobUrl: "https://board-b.com/job/2",
        salary: "$150k",
      }),
      makeJob({
        title: "SRE Engineer",
        employer: "Acme Labs",
        jobUrl: "https://board-c.com/job/3",
        jobDescription: "Maintain infrastructure.",
      }),
    ];

    const result = deduplicateJobsByTitleAndEmployer(jobs);
    expect(result).toHaveLength(1);
    expect(result[0].location).toBe("Remote");
    expect(result[0].salary).toBe("$150k");
    expect(result[0].jobDescription).toBe("Maintain infrastructure.");
  });

  it("respects custom threshold overrides", () => {
    // With a very high threshold (100) nothing except exact matches should collapse
    const first = makeJob({ title: "Senior Engineer", employer: "Acme Ltd" });
    const second = makeJob({
      title: "Senior Engineer",
      employer: "Acme Limited",
    });

    // Default thresholds → merged
    expect(deduplicateJobsByTitleAndEmployer([first, second])).toHaveLength(1);

    // employerThreshold=100 → not merged (Ltd vs Limited doesn't hit 100)
    expect(
      deduplicateJobsByTitleAndEmployer([first, second], {
        employerThreshold: 100,
      }),
    ).toHaveLength(2);
  });
});

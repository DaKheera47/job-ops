import { createJob } from "@shared/testing/factories.js";
import { describe, expect, it } from "vitest";
import {
  attachAppliedDuplicateMatches,
  findAppliedDuplicateMatch,
  isHistoricalAppliedJob,
} from "./applied-duplicate-matching";

describe("applied duplicate matching", () => {
  it("matches reposted jobs with the same title and company", () => {
    const repostedJob = createJob({
      id: "new-job",
      title: "Backend Engineer",
      employer: "Acme Labs",
      status: "ready",
      discoveredAt: "2026-04-15T10:00:00.000Z",
    });
    const appliedJob = createJob({
      id: "applied-job",
      title: "Backend Engineer",
      employer: "Acme Labs",
      status: "applied",
      appliedAt: "2026-04-01T10:00:00.000Z",
    });

    expect(findAppliedDuplicateMatch(repostedJob, [appliedJob])).toEqual({
      jobId: "applied-job",
      title: "Backend Engineer",
      employer: "Acme Labs",
      appliedAt: "2026-04-01T10:00:00.000Z",
      score: 100,
      titleScore: 100,
      employerScore: 100,
    });
  });

  it("treats employer suffix variants as the same company", () => {
    const repostedJob = createJob({
      id: "new-job",
      title: "Platform Engineer",
      employer: "Acme Ltd",
      status: "discovered",
      discoveredAt: "2026-04-15T10:00:00.000Z",
    });
    const appliedJob = createJob({
      id: "applied-job",
      title: "Platform Engineer",
      employer: "Acme Limited",
      status: "applied",
      appliedAt: "2026-04-01T10:00:00.000Z",
    });

    const match = findAppliedDuplicateMatch(repostedJob, [appliedJob]);
    expect(match?.jobId).toBe("applied-job");
    expect(match?.employerScore).toBe(100);
  });

  it("does not match when the company differs", () => {
    const repostedJob = createJob({
      id: "new-job",
      title: "Backend Engineer",
      employer: "Acme Labs",
      status: "ready",
      discoveredAt: "2026-04-15T10:00:00.000Z",
    });
    const appliedJob = createJob({
      id: "applied-job",
      title: "Backend Engineer",
      employer: "Globex",
      status: "applied",
      appliedAt: "2026-04-01T10:00:00.000Z",
    });

    expect(findAppliedDuplicateMatch(repostedJob, [appliedJob])).toBeNull();
  });

  it("does not match when the title differs meaningfully", () => {
    const repostedJob = createJob({
      id: "new-job",
      title: "Backend Engineer",
      employer: "Acme Labs",
      status: "ready",
      discoveredAt: "2026-04-15T10:00:00.000Z",
    });
    const appliedJob = createJob({
      id: "applied-job",
      title: "Product Designer",
      employer: "Acme Labs",
      status: "applied",
      appliedAt: "2026-04-01T10:00:00.000Z",
    });

    expect(findAppliedDuplicateMatch(repostedJob, [appliedJob])).toBeNull();
  });

  it("prefers the strongest match and breaks ties by most recent application", () => {
    const repostedJob = createJob({
      id: "new-job",
      title: "Senior Backend Engineer",
      employer: "Acme Labs",
      status: "ready",
      discoveredAt: "2026-04-15T10:00:00.000Z",
    });
    const olderPerfectMatch = createJob({
      id: "older-perfect",
      title: "Senior Backend Engineer",
      employer: "Acme Labs",
      status: "applied",
      appliedAt: "2026-03-01T10:00:00.000Z",
    });
    const newerPerfectMatch = createJob({
      id: "newer-perfect",
      title: "Senior Backend Engineer",
      employer: "Acme Labs",
      status: "in_progress",
      appliedAt: "2026-04-01T10:00:00.000Z",
    });
    const weakerMatch = createJob({
      id: "weaker-match",
      title: "Backend Engineer",
      employer: "Acme Labs",
      status: "applied",
      appliedAt: "2026-04-10T10:00:00.000Z",
    });

    const match = findAppliedDuplicateMatch(repostedJob, [
      weakerMatch,
      olderPerfectMatch,
      newerPerfectMatch,
    ]);

    expect(match?.jobId).toBe("newer-perfect");
    expect(match?.score).toBe(100);
  });

  it("does not surface a duplicate badge on already applied jobs", () => {
    const firstAppliedJob = createJob({
      id: "applied-job-1",
      title: "Backend Engineer",
      employer: "Acme Labs",
      status: "applied",
      appliedAt: "2026-03-01T10:00:00.000Z",
    });
    const secondAppliedJob = createJob({
      id: "applied-job-2",
      title: "Backend Engineer",
      employer: "Acme Labs",
      status: "applied",
      appliedAt: "2026-04-01T10:00:00.000Z",
    });

    const [annotatedJob] = attachAppliedDuplicateMatches(
      [firstAppliedJob],
      [firstAppliedJob, secondAppliedJob],
    );

    expect(annotatedJob.appliedDuplicateMatch).toBeNull();
  });

  it("treats in-progress jobs without an applied timestamp as non-historical", () => {
    expect(
      isHistoricalAppliedJob({
        status: "in_progress",
        appliedAt: null,
      }),
    ).toBe(false);
  });

  it("does not match when the historical application is older than 30 days", () => {
    const repostedJob = createJob({
      id: "new-job",
      title: "Backend Engineer",
      employer: "Acme Labs",
      status: "ready",
      discoveredAt: "2026-05-15T10:00:00.000Z",
    });
    const oldAppliedJob = createJob({
      id: "applied-job",
      title: "Backend Engineer",
      employer: "Acme Labs",
      status: "applied",
      appliedAt: "2026-04-01T10:00:00.000Z",
    });

    expect(findAppliedDuplicateMatch(repostedJob, [oldAppliedJob])).toBeNull();
  });
});

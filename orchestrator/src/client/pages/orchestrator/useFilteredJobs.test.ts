import { createJob } from "@shared/testing/factories";
import type { Job } from "@shared/types";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JobDateFilter, JobFilters } from "./constants";
import { useFilteredJobs } from "./useFilteredJobs";

const baseJob = createJob({
  id: "job-1",
  source: "linkedin",
  title: "Engineer",
  employer: "Acme",
  location: "London",
  jobDescription: "Desc",
  status: "ready",
});

const defaultDateFilter: JobDateFilter = {
  dimensions: [],
  startDate: null,
  endDate: null,
  preset: null,
};

const baseFilters: JobFilters = {
  activeTab: "ready",
  dateFilter: defaultDateFilter,
  sourceFilter: "all",
  sponsorFilter: "all",
  salaryFilter: { mode: "at_least", min: null, max: null },
  scoreFilter: { mode: "any", min: null, max: null },
  postedWithinDays: null,
  employmentTypes: [],
  location: "",
  sort: { key: "score", direction: "desc" },
};

const makeFilters = (overrides: Partial<JobFilters>): JobFilters => ({
  ...baseFilters,
  ...overrides,
});

describe("useFilteredJobs", () => {
  it("keeps ready and processing jobs in the ready tab", () => {
    const jobs: Job[] = [
      { ...baseJob, id: "ready", status: "ready" },
      { ...baseJob, id: "processing", status: "processing" },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(jobs, makeFilters({ activeTab: "ready" })),
    );

    expect(result.current.map((job) => job.id)).toEqual([
      "processing",
      "ready",
    ]);
  });

  it("filters by discovered date on the discovered tab", () => {
    const jobs: Job[] = [
      {
        ...baseJob,
        id: "match",
        status: "discovered",
        discoveredAt: "2026-04-05T14:00:00.000Z",
      },
      {
        ...baseJob,
        id: "outside",
        status: "processing",
        discoveredAt: "2026-03-01T14:00:00.000Z",
      },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        makeFilters({
          activeTab: "discovered",
          dateFilter: {
            dimensions: ["discovered"],
            startDate: "2026-04-01",
            endDate: "2026-04-06",
            preset: "custom",
          },
        }),
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(["match"]);
  });

  it("filters applied jobs by applied date", () => {
    const jobs: Job[] = [
      {
        ...baseJob,
        id: "applied",
        status: "applied",
        appliedAt: "2026-04-05T14:00:00.000Z",
      },
      {
        ...baseJob,
        id: "outside",
        status: "applied",
        appliedAt: "2026-03-20T14:00:00.000Z",
      },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        makeFilters({
          activeTab: "applied",
          dateFilter: {
            dimensions: ["applied"],
            startDate: "2026-04-01",
            endDate: "2026-04-06",
            preset: "custom",
          },
        }),
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(["applied"]);
  });

  it("matches multiple date dimensions with OR logic", () => {
    const jobs: Job[] = [
      {
        ...baseJob,
        id: "ready-match",
        status: "ready",
        readyAt: "2026-04-04T14:00:00.000Z",
      },
      {
        ...baseJob,
        id: "closed-match",
        status: "ready",
        closedAt: 1775347200,
      },
      {
        ...baseJob,
        id: "no-match",
        status: "ready",
        readyAt: "2026-03-01T14:00:00.000Z",
      },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        makeFilters({
          activeTab: "all",
          dateFilter: {
            dimensions: ["ready", "closed"],
            startDate: "2026-04-03",
            endDate: "2026-04-06",
            preset: "custom",
          },
        }),
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual([
      "closed-match",
      "ready-match",
    ]);
  });

  it("composes date filtering with source, sponsor, and salary filters", () => {
    const jobs: Job[] = [
      {
        ...baseJob,
        id: "match",
        source: "linkedin",
        appliedAt: "2026-04-05T14:00:00.000Z",
        sponsorMatchScore: 99,
        salaryMinAmount: 80000,
      },
      {
        ...baseJob,
        id: "wrong-source",
        source: "indeed",
        appliedAt: "2026-04-05T14:00:00.000Z",
        sponsorMatchScore: 99,
        salaryMinAmount: 80000,
      },
      {
        ...baseJob,
        id: "wrong-sponsor",
        source: "linkedin",
        appliedAt: "2026-04-05T14:00:00.000Z",
        sponsorMatchScore: 45,
        salaryMinAmount: 80000,
      },
      {
        ...baseJob,
        id: "wrong-salary",
        source: "linkedin",
        appliedAt: "2026-04-05T14:00:00.000Z",
        sponsorMatchScore: 99,
        salaryMinAmount: 50000,
      },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        makeFilters({
          activeTab: "all",
          dateFilter: {
            dimensions: ["applied"],
            startDate: "2026-04-01",
            endDate: "2026-04-06",
            preset: "custom",
          },
          sourceFilter: "linkedin",
          sponsorFilter: "confirmed",
          salaryFilter: { mode: "at_least", min: 70000, max: null },
        }),
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(["match"]);
  });

  it("sorts by posting date while keeping missing values last", () => {
    const jobs: Job[] = [
      {
        ...baseJob,
        id: "missing",
        datePosted: null,
      },
      {
        ...baseJob,
        id: "older",
        datePosted: "2026-05-24",
      },
      {
        ...baseJob,
        id: "newer",
        datePosted: "2026-05-26",
      },
    ];

    const { result, rerender } = renderHook(
      ({ direction }: { direction: "asc" | "desc" }) =>
        useFilteredJobs(
          jobs,
          makeFilters({
            activeTab: "all",
            sort: { key: "datePosted", direction },
          }),
        ),
      {
        initialProps: { direction: "desc" as "asc" | "desc" },
      },
    );

    expect(result.current.map((job) => job.id)).toEqual([
      "newer",
      "older",
      "missing",
    ]);

    rerender({ direction: "asc" });

    expect(result.current.map((job) => job.id)).toEqual([
      "older",
      "newer",
      "missing",
    ]);
  });

  it("filters by employment type and excludes jobs with unknown types", () => {
    const jobs: Job[] = [
      { ...baseJob, id: "full", jobType: "Full-time" },
      { ...baseJob, id: "part", jobType: "Part-time" },
      { ...baseJob, id: "contract", jobType: "Contract" },
      { ...baseJob, id: "unknown", jobType: null },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        makeFilters({
          activeTab: "all",
          employmentTypes: ["full_time", "contract"],
        }),
      ),
    );

    expect(result.current.map((job) => job.id).sort()).toEqual([
      "contract",
      "full",
    ]);
  });

  it("filters by location with order-independent token matching", () => {
    const jobs: Job[] = [
      { ...baseJob, id: "london", location: "London, UK" },
      { ...baseJob, id: "berlin", location: "Berlin, Germany" },
      { ...baseJob, id: "no-location", location: null },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        makeFilters({ activeTab: "all", location: "uk london" }),
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(["london"]);
  });
});

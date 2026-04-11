import { createJob } from "@shared/testing/factories";
import type { Job } from "@shared/types";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { JobDateFilter } from "./constants";
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

describe("useFilteredJobs", () => {
  it("keeps only ready jobs in the ready tab", () => {
    const jobs: Job[] = [
      { ...baseJob, id: "ready", status: "ready" },
      { ...baseJob, id: "processing", status: "processing" },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        "ready",
        defaultDateFilter,
        "all",
        "all",
        { mode: "at_least", min: null, max: null },
        { key: "score", direction: "desc" },
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(["ready"]);
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
        "discovered",
        {
          dimensions: ["discovered"],
          startDate: "2026-04-01",
          endDate: "2026-04-06",
          preset: "custom",
        },
        "all",
        "all",
        { mode: "at_least", min: null, max: null },
        { key: "score", direction: "desc" },
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
        "applied",
        {
          dimensions: ["applied"],
          startDate: "2026-04-01",
          endDate: "2026-04-06",
          preset: "custom",
        },
        "all",
        "all",
        { mode: "at_least", min: null, max: null },
        { key: "score", direction: "desc" },
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
        "all",
        {
          dimensions: ["ready", "closed"],
          startDate: "2026-04-03",
          endDate: "2026-04-06",
          preset: "custom",
        },
        "all",
        "all",
        { mode: "at_least", min: null, max: null },
        { key: "score", direction: "desc" },
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
        "all",
        {
          dimensions: ["applied"],
          startDate: "2026-04-01",
          endDate: "2026-04-06",
          preset: "custom",
        },
        "linkedin",
        "confirmed",
        { mode: "at_least", min: 70000, max: null },
        { key: "score", direction: "desc" },
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(["match"]);
  });

  it("sorts by date using the active date context", () => {
    const jobs: Job[] = [
      {
        ...baseJob,
        id: "older",
        appliedAt: "2026-04-03T14:00:00.000Z",
      },
      {
        ...baseJob,
        id: "newer",
        appliedAt: "2026-04-05T14:00:00.000Z",
      },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        "all",
        {
          dimensions: ["applied"],
          startDate: null,
          endDate: null,
          preset: null,
        },
        "all",
        "all",
        { mode: "at_least", min: null, max: null },
        { key: "date", direction: "desc" },
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(["newer", "older"]);
  });

  it("falls back through the date sort priority when the primary timestamp is missing", () => {
    const jobs: Job[] = [
      {
        ...baseJob,
        id: "fallback",
        appliedAt: "2026-04-05T14:00:00.000Z",
        readyAt: null,
      },
      {
        ...baseJob,
        id: "ready",
        readyAt: "2026-04-04T14:00:00.000Z",
        appliedAt: "2026-04-03T14:00:00.000Z",
      },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        "all",
        {
          dimensions: ["ready", "applied"],
          startDate: null,
          endDate: null,
          preset: null,
        },
        "all",
        "all",
        { mode: "at_least", min: null, max: null },
        { key: "date", direction: "desc" },
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(["fallback", "ready"]);
  });
});

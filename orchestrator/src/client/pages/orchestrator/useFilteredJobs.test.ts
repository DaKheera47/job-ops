import type { Job } from "@shared/types";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFilteredJobs } from "./useFilteredJobs";

const baseJob: Job = {
  id: "job-1",
  source: "linkedin",
  sourceJobId: null,
  jobUrlDirect: null,
  datePosted: null,
  title: "Engineer",
  employer: "Acme",
  employerUrl: null,
  jobUrl: "https://example.com/job-1",
  applicationLink: null,
  disciplines: null,
  deadline: null,
  salary: null,
  location: "London",
  degreeRequired: null,
  starting: null,
  jobDescription: "Desc",
  status: "ready",
  outcome: null,
  closedAt: null,
  suitabilityScore: 90,
  suitabilityReason: null,
  tailoredSummary: null,
  tailoredHeadline: null,
  tailoredSkills: null,
  selectedProjectIds: null,
  pdfPath: null,
  notionPageId: null,
  sponsorMatchScore: null,
  sponsorMatchNames: null,
  jobType: null,
  salarySource: null,
  salaryInterval: null,
  salaryMinAmount: null,
  salaryMaxAmount: null,
  salaryCurrency: null,
  isRemote: null,
  jobLevel: null,
  jobFunction: null,
  listingType: null,
  emails: null,
  companyIndustry: null,
  companyLogo: null,
  companyUrlDirect: null,
  companyAddresses: null,
  companyNumEmployees: null,
  companyRevenue: null,
  companyDescription: null,
  skills: null,
  experienceRange: null,
  companyRating: null,
  companyReviewsCount: null,
  vacancyCount: null,
  workFromHomeType: null,
  discoveredAt: "2025-01-01T00:00:00Z",
  processedAt: null,
  appliedAt: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

describe("useFilteredJobs", () => {
  it("filters by sponsor status categories", () => {
    const jobs: Job[] = [
      { ...baseJob, id: "confirmed", sponsorMatchScore: 99 },
      { ...baseJob, id: "potential", sponsorMatchScore: 82 },
      { ...baseJob, id: "not-found", sponsorMatchScore: 45 },
      { ...baseJob, id: "unknown", sponsorMatchScore: null },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        "all",
        "all",
        "confirmed",
        { mode: "at_least", min: null, max: null },
        {
          key: "score",
          direction: "desc",
        },
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(["confirmed"]);
  });

  it("filters by salary range using structured and text salary fields", () => {
    const jobs: Job[] = [
      { ...baseJob, id: "structured", salaryMinAmount: 70000 },
      { ...baseJob, id: "k-format", salary: "GBP 65k" },
      { ...baseJob, id: "below", salary: "GBP 55k" },
      { ...baseJob, id: "none", salary: null },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        "all",
        "all",
        "all",
        { mode: "between", min: 60000, max: 80000 },
        {
          key: "score",
          direction: "desc",
        },
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual(
      expect.arrayContaining(["structured", "k-format"]),
    );
    expect(result.current).toHaveLength(2);
  });

  it("sorts by salary with highest first and missing salaries last", () => {
    const jobs: Job[] = [
      { ...baseJob, id: "max", salaryMinAmount: 120000 },
      { ...baseJob, id: "mid", salary: "GBP 65k" },
      { ...baseJob, id: "low", salaryMinAmount: 50000 },
      { ...baseJob, id: "none", salary: null, salaryMinAmount: null },
    ];

    const { result } = renderHook(() =>
      useFilteredJobs(
        jobs,
        "all",
        "all",
        "all",
        { mode: "at_least", min: null, max: null },
        {
          key: "salary",
          direction: "desc",
        },
      ),
    );

    expect(result.current.map((job) => job.id)).toEqual([
      "max",
      "mid",
      "low",
      "none",
    ]);
  });
});

import type { BulkJobActionResponse, Job, JobStatus } from "@shared/types.js";
import { describe, expect, it } from "vitest";
import {
  canBulkMoveToReady,
  canBulkSkip,
  getFailedJobIds,
} from "./bulkActions";

function createJob(id: string, status: JobStatus): Job {
  return {
    id,
    source: "linkedin",
    sourceJobId: null,
    jobUrlDirect: null,
    datePosted: null,
    title: "Role",
    employer: "Acme",
    employerUrl: null,
    jobUrl: `https://example.com/${id}`,
    applicationLink: null,
    disciplines: null,
    deadline: null,
    salary: null,
    location: null,
    degreeRequired: null,
    starting: null,
    jobDescription: null,
    status,
    outcome: null,
    closedAt: null,
    suitabilityScore: null,
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
}

describe("bulkActions", () => {
  it("computes eligibility for skip and move-to-ready", () => {
    expect(
      canBulkSkip([createJob("1", "discovered"), createJob("2", "ready")]),
    ).toBe(true);
    expect(canBulkSkip([createJob("1", "applied")])).toBe(false);

    expect(
      canBulkMoveToReady([
        createJob("1", "discovered"),
        createJob("2", "discovered"),
      ]),
    ).toBe(true);
    expect(canBulkMoveToReady([createJob("1", "ready")])).toBe(false);
  });

  it("extracts failed job ids from a bulk response", () => {
    const response: BulkJobActionResponse = {
      action: "skip",
      requested: 3,
      succeeded: 1,
      failed: 2,
      results: [
        { jobId: "job-1", ok: true, job: createJob("job-1", "skipped") },
        {
          jobId: "job-2",
          ok: false,
          error: { code: "INVALID_REQUEST", message: "bad status" },
        },
        {
          jobId: "job-3",
          ok: false,
          error: { code: "NOT_FOUND", message: "missing" },
        },
      ],
    };

    expect(Array.from(getFailedJobIds(response))).toEqual(["job-2", "job-3"]);
  });
});

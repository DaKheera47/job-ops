import type { BulkJobActionResponse, Job, JobStatus } from "@shared/types.js";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useBulkJobSelection } from "./useBulkJobSelection";

vi.mock("../../api", () => ({
  bulkJobAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function createJob(id: string, status: JobStatus): Job {
  return {
    id,
    source: "linkedin",
    sourceJobId: null,
    jobUrlDirect: null,
    datePosted: null,
    title: `Role ${id}`,
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

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("useBulkJobSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("caps select-all to the API max", () => {
    const activeJobs = Array.from({ length: 101 }, (_, index) =>
      createJob(`job-${index + 1}`, "discovered"),
    );
    const loadJobs = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBulkJobSelection({
        activeJobs,
        activeTab: "discovered",
        loadJobs,
      }),
    );

    act(() => {
      result.current.toggleSelectAll(true);
    });

    expect(result.current.selectedJobIds.size).toBe(100);
  });

  it("does not send bulk requests above the max selection size", async () => {
    const activeJobs = Array.from({ length: 101 }, (_, index) =>
      createJob(`job-${index + 1}`, "discovered"),
    );
    const loadJobs = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBulkJobSelection({
        activeJobs,
        activeTab: "discovered",
        loadJobs,
      }),
    );

    act(() => {
      for (const job of activeJobs) {
        result.current.toggleSelectJob(job.id);
      }
    });

    await act(async () => {
      await result.current.runBulkAction("skip");
    });

    expect(api.bulkJobAction).not.toHaveBeenCalled();
  });

  it("reconciles failures with selection changes made during in-flight action", async () => {
    const activeJobs = [
      createJob("job-1", "discovered"),
      createJob("job-2", "discovered"),
      createJob("job-3", "discovered"),
    ];
    const loadJobs = vi.fn().mockResolvedValue(undefined);
    const pending = deferred<BulkJobActionResponse>();
    vi.mocked(api.bulkJobAction).mockImplementation(() => pending.promise);

    const { result } = renderHook(() =>
      useBulkJobSelection({
        activeJobs,
        activeTab: "discovered",
        loadJobs,
      }),
    );

    act(() => {
      result.current.toggleSelectJob("job-1");
      result.current.toggleSelectJob("job-2");
    });

    let runPromise: Promise<void>;
    await act(async () => {
      runPromise = result.current.runBulkAction("skip");
    });

    act(() => {
      result.current.toggleSelectJob("job-2");
      result.current.toggleSelectJob("job-3");
    });

    await act(async () => {
      pending.resolve({
        action: "skip",
        requested: 2,
        succeeded: 1,
        failed: 1,
        results: [
          { jobId: "job-1", ok: true, job: createJob("job-1", "skipped") },
          {
            jobId: "job-2",
            ok: false,
            error: { code: "INVALID_REQUEST", message: "bad status" },
          },
        ],
      });
      await runPromise;
    });

    await waitFor(() => {
      expect(Array.from(result.current.selectedJobIds)).toEqual(["job-3"]);
    });
  });
});

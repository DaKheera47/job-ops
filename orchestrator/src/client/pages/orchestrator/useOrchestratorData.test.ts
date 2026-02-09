import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useOrchestratorData } from "./useOrchestratorData";

vi.mock("../../api", () => ({
  getJobs: vi.fn(),
  getJob: vi.fn(),
  getPipelineStatus: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const makeResponse = (jobId: string) => ({
  jobs: [{ id: jobId }],
  total: 1,
  byStatus: {
    discovered: 1,
    processing: 0,
    ready: 0,
    applied: 0,
    skipped: 0,
    expired: 0,
  },
});

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

describe("useOrchestratorData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(api.getJobs).mockResolvedValue(makeResponse("initial") as any);
    vi.mocked(api.getJob).mockResolvedValue({
      id: "initial",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);
    vi.mocked(api.getPipelineStatus).mockResolvedValue({
      isRunning: false,
    } as any);
  });

  it("applies newest loadJobs response when requests resolve out of order", async () => {
    const { result } = renderHook(() => useOrchestratorData(null));

    await waitFor(() => {
      expect((result.current.jobs[0] as any)?.id).toBe("initial");
    });

    const first = deferred<any>();
    const second = deferred<any>();
    vi.mocked(api.getJobs)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    act(() => {
      void result.current.loadJobs();
      void result.current.loadJobs();
    });

    await act(async () => {
      second.resolve(makeResponse("newest"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect((result.current.jobs[0] as any)?.id).toBe("newest");
    });

    await act(async () => {
      first.resolve(makeResponse("stale"));
      await Promise.resolve();
    });

    expect((result.current.jobs[0] as any)?.id).toBe("newest");
  });

  it("pauses and resumes polling based on isRefreshPaused", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getJobs).mockResolvedValue(makeResponse("steady") as any);

    const { result } = renderHook(() => useOrchestratorData(null));

    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getJobs).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setIsRefreshPaused(true);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const pausedBaselineCalls = vi.mocked(api.getJobs).mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(api.getJobs).toHaveBeenCalledTimes(pausedBaselineCalls);

    act(() => {
      result.current.setIsRefreshPaused(false);
    });

    const resumedBaselineCalls = vi.mocked(api.getJobs).mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(vi.mocked(api.getJobs).mock.calls.length).toBeGreaterThan(
      resumedBaselineCalls,
    );
  });

  it("loads full selected job details on demand", async () => {
    vi.mocked(api.getJobs).mockResolvedValue({
      jobs: [
        {
          id: "job-1",
          title: "Role",
          employer: "Acme",
          source: "manual",
          jobUrl: "https://example.com/job-1",
          applicationLink: null,
          datePosted: null,
          deadline: null,
          salary: null,
          location: null,
          status: "discovered",
          suitabilityScore: null,
          sponsorMatchScore: null,
          jobType: null,
          jobFunction: null,
          salaryMinAmount: null,
          salaryMaxAmount: null,
          salaryCurrency: null,
          discoveredAt: "2026-01-01T00:00:00.000Z",
          appliedAt: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      byStatus: {
        discovered: 1,
        processing: 0,
        ready: 0,
        applied: 0,
        skipped: 0,
        expired: 0,
      },
    } as any);
    vi.mocked(api.getJob).mockResolvedValue({
      id: "job-1",
      title: "Role",
      employer: "Acme",
      status: "discovered",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as any);

    const { result } = renderHook(() => useOrchestratorData("job-1"));

    await waitFor(() => {
      expect(api.getJobs).toHaveBeenCalledWith({ view: "list" });
    });

    await waitFor(() => {
      expect(api.getJob).toHaveBeenCalledWith("job-1");
      expect((result.current.selectedJob as any)?.id).toBe("job-1");
    });
  });
});

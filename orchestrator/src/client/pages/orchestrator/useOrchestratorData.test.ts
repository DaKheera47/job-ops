import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useOrchestratorData } from "./useOrchestratorData";

vi.mock("../../api", () => ({
  getJobs: vi.fn(),
  getJobsRevision: vi.fn(),
  getJob: vi.fn(),
  getPipelineStatus: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const makeResponse = (jobId: string, revision = `rev-${jobId}`) => ({
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
  revision,
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
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    vi.mocked(api.getJobs).mockResolvedValue(
      makeResponse("initial", "rev-initial") as any,
    );
    vi.mocked(api.getJobsRevision).mockResolvedValue({
      revision: "rev-initial",
      latestUpdatedAt: "2026-01-01T00:00:00.000Z",
      total: 1,
      statusFilter: null,
    } as any);
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

  it("checks revision every 30s and skips full reload when unchanged", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getJobs).mockResolvedValue(
      makeResponse("steady", "rev-steady") as any,
    );
    vi.mocked(api.getJobsRevision).mockResolvedValue({
      revision: "rev-steady",
      latestUpdatedAt: "2026-01-01T00:00:00.000Z",
      total: 1,
      statusFilter: null,
    } as any);

    renderHook(() => useOrchestratorData(null));

    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getJobs).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
    });

    expect(api.getJobsRevision).toHaveBeenCalledTimes(1);
    expect(api.getJobs).toHaveBeenCalledTimes(1);
  });

  it("loads full list when revision changes", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getJobs)
      .mockResolvedValueOnce(makeResponse("initial", "rev-initial") as any)
      .mockResolvedValueOnce(makeResponse("newest", "rev-new") as any);
    vi.mocked(api.getJobsRevision)
      .mockResolvedValueOnce({
        revision: "rev-new",
        latestUpdatedAt: "2026-01-02T00:00:00.000Z",
        total: 1,
        statusFilter: null,
      } as any)
      .mockResolvedValue({
        revision: "rev-new",
        latestUpdatedAt: "2026-01-02T00:00:00.000Z",
        total: 1,
        statusFilter: null,
      } as any);

    renderHook(() => useOrchestratorData(null));

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getJobs).toHaveBeenCalledTimes(2);
  });

  it("triggers immediate revision checks on focus/online/visibility", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getJobs).mockResolvedValue(
      makeResponse("initial", "rev-initial") as any,
    );

    renderHook(() => useOrchestratorData(null));

    await act(async () => {
      await Promise.resolve();
    });
    vi.mocked(api.getJobsRevision).mockClear();

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getJobsRevision).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getJobsRevision).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.getJobsRevision).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getJobsRevision).toHaveBeenCalledTimes(3);
  });

  it("suppresses interval checks while tab is hidden", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getJobs).mockResolvedValue(
      makeResponse("initial", "rev-initial") as any,
    );

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });

    renderHook(() => useOrchestratorData(null));

    await act(async () => {
      await Promise.resolve();
    });
    vi.mocked(api.getJobsRevision).mockClear();

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
    });
    expect(api.getJobsRevision).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.getJobsRevision).toHaveBeenCalledTimes(1);
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
      revision: "rev-job-1",
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

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useOrchestratorData } from "./useOrchestratorData";

vi.mock("../../api", () => ({
  getJobs: vi.fn(),
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
    vi.mocked(api.getPipelineStatus).mockResolvedValue({
      isRunning: false,
    } as any);
  });

  it("applies newest loadJobs response when requests resolve out of order", async () => {
    const { result } = renderHook(() => useOrchestratorData());

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

    const { result } = renderHook(() => useOrchestratorData());

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
});

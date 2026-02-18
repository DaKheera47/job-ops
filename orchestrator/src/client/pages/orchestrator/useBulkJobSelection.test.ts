import { createJob } from "@shared/testing/factories.js";
import type {
  BulkJobActionResponse,
  BulkJobActionStreamEvent,
} from "@shared/types.js";
import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useBulkJobSelection } from "./useBulkJobSelection";

vi.mock("../../api", () => ({
  streamBulkJobAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(),
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

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

const asStreamEvents = (
  response: BulkJobActionResponse,
  requestId = "req-bulk",
): BulkJobActionStreamEvent[] => {
  const events: BulkJobActionStreamEvent[] = [
    {
      type: "started",
      action: response.action,
      requested: response.requested,
      completed: 0,
      succeeded: 0,
      failed: 0,
      requestId,
    },
  ];

  let succeeded = 0;
  let failed = 0;
  response.results.forEach((result, index) => {
    if (result.ok) succeeded += 1;
    else failed += 1;
    events.push({
      type: "progress",
      action: response.action,
      requested: response.requested,
      completed: index + 1,
      succeeded,
      failed,
      result,
      requestId,
    });
  });

  events.push({
    type: "completed",
    action: response.action,
    requested: response.requested,
    completed: response.requested,
    succeeded: response.succeeded,
    failed: response.failed,
    results: response.results,
    requestId,
  });

  return events;
};

const mockStreamBulkAction = (
  response: BulkJobActionResponse,
  waitForRelease?: Promise<void>,
) => {
  vi.mocked(api.streamBulkJobAction).mockImplementation(
    async (_input, handlers) => {
      for (const event of asStreamEvents(response)) {
        if (event.type === "started") handlers.onEvent(event);
      }
      if (waitForRelease) await waitForRelease;
      for (const event of asStreamEvents(response)) {
        if (event.type !== "started") handlers.onEvent(event);
      }
      return;
    },
  );
};

describe("useBulkJobSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(toast.loading).mockReturnValue("bulk-progress-toast");
  });

  it("caps select-all to the API max", () => {
    const activeJobs = Array.from({ length: 101 }, (_, index) =>
      createJob({ id: `job-${index + 1}`, status: "discovered" }),
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
      createJob({ id: `job-${index + 1}`, status: "discovered" }),
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

    expect(api.streamBulkJobAction).not.toHaveBeenCalled();
  });

  it("reconciles failures with selection changes made during in-flight action", async () => {
    const activeJobs = [
      createJob({ id: "job-1", status: "discovered" }),
      createJob({ id: "job-2", status: "discovered" }),
      createJob({ id: "job-3", status: "discovered" }),
    ];
    const loadJobs = vi.fn().mockResolvedValue(undefined);
    const release = deferred<void>();
    mockStreamBulkAction(
      {
        action: "skip",
        requested: 2,
        succeeded: 1,
        failed: 1,
        results: [
          {
            jobId: "job-1",
            ok: true,
            job: createJob({ id: "job-1", status: "skipped" }),
          },
          {
            jobId: "job-2",
            ok: false,
            error: { code: "INVALID_REQUEST", message: "bad status" },
          },
        ],
      },
      release.promise,
    );

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

    expect(toast.loading).toHaveBeenCalled();
    const firstLoadingCall = vi.mocked(toast.loading).mock.calls[0];
    expect(firstLoadingCall[1]).not.toHaveProperty("cancel");

    act(() => {
      result.current.toggleSelectJob("job-2");
      result.current.toggleSelectJob("job-3");
    });

    await act(async () => {
      release.resolve();
      await runPromise;
    });

    await waitFor(() => {
      expect(Array.from(result.current.selectedJobIds)).toEqual(["job-3"]);
    });
    expect(toast.dismiss).toHaveBeenCalled();
  });

  it("runs bulk rescore and reports success copy", async () => {
    const activeJobs = [
      createJob({ id: "job-1", status: "ready" }),
      createJob({ id: "job-2", status: "ready" }),
    ];
    const loadJobs = vi.fn().mockResolvedValue(undefined);
    mockStreamBulkAction({
      action: "rescore",
      requested: 2,
      succeeded: 2,
      failed: 0,
      results: [
        {
          jobId: "job-1",
          ok: true,
          job: createJob({ id: "job-1", status: "ready" }),
        },
        {
          jobId: "job-2",
          ok: true,
          job: createJob({ id: "job-2", status: "ready" }),
        },
      ],
    });

    const { result } = renderHook(() =>
      useBulkJobSelection({
        activeJobs,
        activeTab: "ready",
        loadJobs,
      }),
    );

    act(() => {
      result.current.toggleSelectJob("job-1");
      result.current.toggleSelectJob("job-2");
    });

    await act(async () => {
      await result.current.runBulkAction("rescore");
    });

    expect(api.streamBulkJobAction).toHaveBeenCalledWith(
      { action: "rescore", jobIds: ["job-1", "job-2"] },
      expect.objectContaining({
        onEvent: expect.any(Function),
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("2 matches recalculated");
  });
});

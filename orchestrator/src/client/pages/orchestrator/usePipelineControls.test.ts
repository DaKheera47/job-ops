import { useSettings } from "@client/hooks/useSettings";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackProductEvent } from "@/lib/analytics";
import { RUN_MODE_STORAGE_KEY } from "./run-mode";
import { usePipelineControls } from "./usePipelineControls";

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackProductEvent: vi.fn(),
}));

describe("usePipelineControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useSettings).mockReturnValue({
      refreshSettings: vi.fn().mockResolvedValue(null),
    } as never);
  });

  it("tracks manual import provenance when a job is imported", async () => {
    const loadJobs = vi.fn().mockResolvedValue(undefined);
    const navigateWithContext = vi.fn();

    const { result } = renderHook(() =>
      usePipelineControls({
        isPipelineRunning: false,
        setIsPipelineRunning: vi.fn(),
        pipelineTerminalEvent: null,
        pipelineSources: ["linkedin"],
        loadJobs,
        navigateWithContext,
      }),
    );

    await act(async () => {
      await result.current.handleManualImported({
        jobId: "job-1",
        source: "fetched_url",
        sourceHost: "jobs.example.com",
      });
    });

    expect(trackProductEvent).toHaveBeenCalledWith(
      "jobs_manual_import_completed",
      {
        manual_import_source: "fetched_url",
        manual_import_source_host: "jobs.example.com",
      },
    );
    expect(loadJobs).toHaveBeenCalledOnce();
    expect(navigateWithContext).toHaveBeenCalledWith("ready", "job-1");
  });

  it("restores the last selected run mode", () => {
    const args = {
      isPipelineRunning: false,
      setIsPipelineRunning: vi.fn(),
      pipelineTerminalEvent: null,
      pipelineSources: ["linkedin"],
      loadJobs: vi.fn().mockResolvedValue(undefined),
      navigateWithContext: vi.fn(),
    };

    const first = renderHook(() => usePipelineControls(args));
    act(() => first.result.current.setRunMode("manual"));
    first.unmount();

    const second = renderHook(() => usePipelineControls(args));
    expect(second.result.current.runMode).toBe("manual");
    expect(localStorage.getItem(RUN_MODE_STORAGE_KEY)).toBe("manual");
  });
});

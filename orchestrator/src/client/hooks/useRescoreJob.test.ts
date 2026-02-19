import { act } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { renderHookWithQueryClient } from "../test/renderWithQueryClient";
import { useRescoreJob } from "./useRescoreJob";

vi.mock("../api", () => ({
  rescoreJob: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("useRescoreJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rescoring updates the job and shows a toast", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.rescoreJob).mockResolvedValue({} as any);

    const { result } = renderHookWithQueryClient(() =>
      useRescoreJob(onJobUpdated),
    );

    await act(async () => {
      await result.current.rescoreJob("job-1");
    });

    expect(api.rescoreJob).toHaveBeenCalledWith("job-1");
    expect(onJobUpdated).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Match recalculated");
  });
});

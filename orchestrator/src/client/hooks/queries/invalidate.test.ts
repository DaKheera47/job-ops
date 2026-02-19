import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/client/lib/queryKeys";
import { invalidateJobData } from "./invalidate";

describe("invalidateJobData", () => {
  it("invalidates in-progress board when invalidating a specific job", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    await invalidateJobData(queryClient, "job-1");

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.jobs.inProgressBoard(),
    });
  });
});

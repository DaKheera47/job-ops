import * as api from "@client/api";
import type { JobNote } from "@shared/types";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/client/lib/queryKeys";
import { renderHookWithQueryClient } from "@/client/test/renderWithQueryClient";
import { useCreateJobNoteMutation } from "./useJobMutations";

vi.mock("@client/api", () => ({
  createJobNote: vi.fn(),
}));

describe("job note mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates the job notes query after creating a note", async () => {
    const note: JobNote = {
      id: "note-1",
      jobId: "job-1",
      title: "Why applied",
      content: "Because it fits.",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(api.createJobNote).mockResolvedValue(note);

    const { result, queryClient } = renderHookWithQueryClient(() =>
      useCreateJobNoteMutation(),
    );
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await act(async () => {
      await result.current.mutateAsync({
        jobId: "job-1",
        input: {
          title: "Why applied",
          content: "Because it fits.",
        },
      });
    });

    expect(api.createJobNote).toHaveBeenCalledWith("job-1", {
      title: "Why applied",
      content: "Because it fits.",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.jobs.notes("job-1"),
    });
  });
});

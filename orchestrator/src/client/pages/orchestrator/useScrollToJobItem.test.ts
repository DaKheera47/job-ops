import { createJob } from "@shared/testing/factories.js";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import type { VirtualListHandle } from "@/client/lib/virtual-list";
import { useScrollToJobItem } from "./useScrollToJobItem";

describe("useScrollToJobItem", () => {
  it("scrolls once the list handle is available", async () => {
    const activeJobs = [
      createJob({ id: "job-1", status: "ready" }),
      createJob({ id: "job-2", status: "ready" }),
      createJob({ id: "job-3", status: "ready" }),
    ];
    const scrollToIndex = vi.fn();
    const listHandleRef = {
      current: null,
    } as MutableRefObject<VirtualListHandle | null>;
    const onEnsureJobSelected = vi.fn();

    const { result } = renderHook(() =>
      useScrollToJobItem({
        activeJobs,
        selectedJobId: "job-2",
        isDesktop: true,
        onEnsureJobSelected,
        listHandleRef,
      }),
    );

    await act(async () => {
      result.current.requestScrollToJob("job-2");
      listHandleRef.current = {
        scrollToIndex,
      };
    });

    await waitFor(() => {
      expect(scrollToIndex).toHaveBeenCalledWith(1, {
        align: "center",
        behavior: "smooth",
      });
    });
    expect(onEnsureJobSelected).not.toHaveBeenCalled();
  });
});

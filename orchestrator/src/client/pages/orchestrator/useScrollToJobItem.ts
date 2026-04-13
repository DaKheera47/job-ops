import type { JobListItem } from "@shared/types.js";
import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import type { VirtualListHandle } from "@/client/lib/virtual-list";

type PendingScrollTarget = {
  jobId: string;
  ensureSelected: boolean;
  selectionRequested: boolean;
};

type UseScrollToJobItemParams = {
  activeJobs: JobListItem[];
  selectedJobId: string | null;
  isDesktop: boolean;
  onEnsureJobSelected: (jobId: string) => void;
  listHandleRef: RefObject<VirtualListHandle>;
};

export const useScrollToJobItem = ({
  activeJobs,
  selectedJobId,
  isDesktop,
  onEnsureJobSelected,
  listHandleRef,
}: UseScrollToJobItemParams) => {
  const [pendingTarget, setPendingTarget] =
    useState<PendingScrollTarget | null>(null);

  const requestScrollToJob = useCallback(
    (jobId: string, options?: { ensureSelected?: boolean }) => {
      setPendingTarget({
        jobId,
        ensureSelected: options?.ensureSelected ?? false,
        selectionRequested: false,
      });
    },
    [],
  );

  useEffect(() => {
    if (!pendingTarget) return;
    if (!activeJobs.some((job) => job.id === pendingTarget.jobId)) return;

    if (selectedJobId !== pendingTarget.jobId) {
      if (!pendingTarget.ensureSelected || pendingTarget.selectionRequested)
        return;
      onEnsureJobSelected(pendingTarget.jobId);
      setPendingTarget((current) =>
        current
          ? {
              ...current,
              selectionRequested: true,
            }
          : null,
      );
      return;
    }

    const targetIndex = activeJobs.findIndex(
      (job) => job.id === pendingTarget.jobId,
    );
    const listHandle = listHandleRef.current;
    if (targetIndex === -1 || !listHandle) return;

    listHandle.scrollToIndex(targetIndex, {
      align: "center",
      behavior: isDesktop ? "smooth" : "auto",
    });
    setPendingTarget(null);
  }, [
    activeJobs,
    isDesktop,
    onEnsureJobSelected,
    pendingTarget,
    selectedJobId,
    listHandleRef,
  ]);

  return { requestScrollToJob };
};

import type { JobListItem } from "@shared/types.js";
import { useCallback, useEffect, useState } from "react";

const escapeCssAttributeValue = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

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
};

export const useScrollToJobItem = ({
  activeJobs,
  selectedJobId,
  isDesktop,
  onEnsureJobSelected,
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

    if (typeof document === "undefined") return;
    const selector = `[data-job-id="${escapeCssAttributeValue(pendingTarget.jobId)}"]`;
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;

    target.scrollIntoView({
      behavior: isDesktop ? "smooth" : "auto",
      block: "center",
    });
    setPendingTarget(null);
  }, [
    activeJobs,
    isDesktop,
    onEnsureJobSelected,
    pendingTarget,
    selectedJobId,
  ]);

  return { requestScrollToJob };
};

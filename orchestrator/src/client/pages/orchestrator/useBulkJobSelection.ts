import type { BulkJobAction, Job } from "@shared/types.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";
import {
  canBulkMoveToReady,
  canBulkSkip,
  getFailedJobIds,
} from "./bulkActions";
import type { FilterTab } from "./constants";

const MAX_BULK_ACTION_JOB_IDS = 100;

interface UseBulkJobSelectionArgs {
  activeJobs: Job[];
  activeTab: FilterTab;
  loadJobs: () => Promise<void>;
}

export function useBulkJobSelection({
  activeJobs,
  activeTab,
  loadJobs,
}: UseBulkJobSelectionArgs) {
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkActionInFlight, setBulkActionInFlight] =
    useState<null | BulkJobAction>(null);
  const previousActiveTabRef = useRef<FilterTab>(activeTab);

  const selectedJobs = useMemo(
    () => activeJobs.filter((job) => selectedJobIds.has(job.id)),
    [activeJobs, selectedJobIds],
  );

  const canSkipSelected = useMemo(
    () => canBulkSkip(selectedJobs),
    [selectedJobs],
  );
  const canMoveSelected = useMemo(
    () => canBulkMoveToReady(selectedJobs),
    [selectedJobs],
  );

  useEffect(() => {
    if (previousActiveTabRef.current === activeTab) return;
    previousActiveTabRef.current = activeTab;
    setSelectedJobIds(new Set());
  }, [activeTab]);

  useEffect(() => {
    const activeJobIdSet = new Set(activeJobs.map((job) => job.id));
    setSelectedJobIds((previous) => {
      if (previous.size === 0) return previous;
      const next = new Set(
        Array.from(previous).filter((jobId) => activeJobIdSet.has(jobId)),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [activeJobs]);

  const toggleSelectJob = useCallback((jobId: string) => {
    setSelectedJobIds((previous) => {
      const next = new Set(previous);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedJobIds(() => {
        if (!checked) return new Set();
        const allIds = activeJobs.map((job) => job.id);
        if (allIds.length <= MAX_BULK_ACTION_JOB_IDS) {
          return new Set(allIds);
        }
        toast.error(
          `Select all is limited to ${MAX_BULK_ACTION_JOB_IDS} jobs per action.`,
        );
        return new Set(allIds.slice(0, MAX_BULK_ACTION_JOB_IDS));
      });
    },
    [activeJobs],
  );

  const clearSelection = useCallback(() => {
    setSelectedJobIds(new Set());
  }, []);

  const runBulkAction = useCallback(
    async (action: BulkJobAction) => {
      const selectedAtStart = Array.from(selectedJobIds);
      if (selectedAtStart.length === 0) return;
      if (selectedAtStart.length > MAX_BULK_ACTION_JOB_IDS) {
        toast.error(
          `You can run bulk actions on up to ${MAX_BULK_ACTION_JOB_IDS} jobs at a time.`,
        );
        return;
      }

      const selectedAtStartSet = new Set(selectedAtStart);
      try {
        setBulkActionInFlight(action);
        const result = await api.bulkJobAction({
          action,
          jobIds: selectedAtStart,
        });

        const failedIds = getFailedJobIds(result);
        const successLabel =
          action === "skip" ? "jobs skipped" : "jobs moved to Ready";

        if (result.failed === 0) {
          toast.success(`${result.succeeded} ${successLabel}`);
        } else {
          toast.error(
            `${result.succeeded} succeeded, ${result.failed} failed.`,
          );
        }

        await loadJobs();
        setSelectedJobIds((current) => {
          const addedDuringRequest = Array.from(current).filter(
            (jobId) => !selectedAtStartSet.has(jobId),
          );
          const removedDuringRequest = Array.from(selectedAtStartSet).filter(
            (jobId) => !current.has(jobId),
          );
          const next = new Set([
            ...Array.from(failedIds),
            ...addedDuringRequest,
          ]);
          for (const jobId of removedDuringRequest) next.delete(jobId);
          return next;
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to run bulk action";
        toast.error(message);
      } finally {
        setBulkActionInFlight(null);
      }
    },
    [selectedJobIds, loadJobs],
  );

  return {
    selectedJobIds,
    canSkipSelected,
    canMoveSelected,
    bulkActionInFlight,
    toggleSelectJob,
    toggleSelectAll,
    clearSelection,
    runBulkAction,
  };
}

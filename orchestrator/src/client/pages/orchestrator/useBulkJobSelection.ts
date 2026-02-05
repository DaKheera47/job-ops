import type { BulkJobAction, Job } from "@shared/types.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";
import {
  canBulkMoveToReady,
  canBulkSkip,
  getFailedJobIds,
} from "./bulkActions";
import type { FilterTab } from "./constants";

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

  const bulkActionHint = useMemo(() => {
    if (selectedJobs.length === 0) return null;
    if (!canMoveSelected && !canSkipSelected) {
      return "Selected jobs are not eligible for bulk actions.";
    }
    if (!canMoveSelected) {
      return "Move to Ready only works for discovered jobs.";
    }
    if (!canSkipSelected) {
      return "Skip only works for discovered or ready jobs.";
    }
    return null;
  }, [selectedJobs, canMoveSelected, canSkipSelected]);

  useEffect(() => {
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
      setSelectedJobIds(() =>
        checked ? new Set(activeJobs.map((job) => job.id)) : new Set(),
      );
    },
    [activeJobs],
  );

  const clearSelection = useCallback(() => {
    setSelectedJobIds(new Set());
  }, []);

  const runBulkAction = useCallback(
    async (action: BulkJobAction) => {
      if (selectedJobIds.size === 0) return;
      try {
        setBulkActionInFlight(action);
        const result = await api.bulkJobAction({
          action,
          jobIds: Array.from(selectedJobIds),
        });

        const failedIds = getFailedJobIds(result);
        const successLabel =
          action === "skip" ? "jobs skipped" : "jobs moved to Ready";

        if (result.failed === 0) {
          toast.success(`${result.succeeded} ${successLabel}`);
        } else {
          toast.error(`${result.succeeded} succeeded, ${result.failed} failed.`);
        }

        await loadJobs();
        setSelectedJobIds(failedIds);
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
    bulkActionHint,
    bulkActionInFlight,
    toggleSelectJob,
    toggleSelectAll,
    clearSelection,
    runBulkAction,
  };
}

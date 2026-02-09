import type { Job, JobListItem, JobStatus } from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";

const initialStats: Record<JobStatus, number> = {
  discovered: 0,
  processing: 0,
  ready: 0,
  applied: 0,
  skipped: 0,
  expired: 0,
};

const isDocumentVisible = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

export const useOrchestratorData = (selectedJobId: string | null) => {
  const [jobListItems, setJobListItems] = useState<JobListItem[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [stats, setStats] = useState<Record<JobStatus, number>>(initialStats);
  const [isLoading, setIsLoading] = useState(true);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [isRefreshPaused, setIsRefreshPaused] = useState(false);
  const requestSeqRef = useRef(0);
  const latestAppliedSeqRef = useRef(0);
  const pendingLoadCountRef = useRef(0);
  const selectedJobRequestSeqRef = useRef(0);
  const selectedJobCacheRef = useRef<Map<string, Job>>(new Map());
  const lastRevisionRef = useRef<string | null>(null);

  const loadSelectedJob = useCallback(
    async (jobId: string) => {
      const seq = ++selectedJobRequestSeqRef.current;
      try {
        const fullJob = await api.getJob(jobId);
        selectedJobCacheRef.current.set(jobId, fullJob);
        if (
          selectedJobId === jobId &&
          seq === selectedJobRequestSeqRef.current
        ) {
          setSelectedJob(fullJob);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load selected job details";
        toast.error(message);
      }
    },
    [selectedJobId],
  );

  const loadJobs = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    pendingLoadCountRef.current += 1;
    try {
      setIsLoading(true);
      const data = await api.getJobs({ view: "list" });
      if (seq >= latestAppliedSeqRef.current) {
        latestAppliedSeqRef.current = seq;
        setJobListItems(data.jobs);
        setStats(data.byStatus);
        lastRevisionRef.current = data.revision;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load jobs";
      toast.error(message);
    } finally {
      pendingLoadCountRef.current = Math.max(
        0,
        pendingLoadCountRef.current - 1,
      );
      if (pendingLoadCountRef.current === 0) {
        setIsLoading(false);
      }
    }
  }, []);

  const checkPipelineStatus = useCallback(async () => {
    try {
      const status = await api.getPipelineStatus();
      setIsPipelineRunning(status.isRunning);
    } catch {
      // Ignore errors
    }
  }, []);

  const checkForJobChanges = useCallback(async () => {
    if (isRefreshPaused || !isDocumentVisible()) return;
    try {
      const revision = await api.getJobsRevision();
      const previousRevision = lastRevisionRef.current;
      if (previousRevision === null) {
        lastRevisionRef.current = revision.revision;
        return;
      }
      if (revision.revision !== previousRevision) {
        await loadJobs();
      }
    } catch {
      // Ignore errors
    }
  }, [isRefreshPaused, loadJobs]);

  useEffect(() => {
    void loadJobs();
    void checkPipelineStatus();
  }, [checkPipelineStatus, loadJobs]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isDocumentVisible() || isRefreshPaused) return;
      void checkForJobChanges();
      void checkPipelineStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkForJobChanges, checkPipelineStatus, isRefreshPaused]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshFromVisibilitySignal = () => {
      if (!isDocumentVisible() || isRefreshPaused) return;
      void checkForJobChanges();
      void checkPipelineStatus();
    };

    const onVisibilityChange = () => {
      if (!isDocumentVisible()) return;
      refreshFromVisibilitySignal();
    };

    window.addEventListener("focus", refreshFromVisibilitySignal);
    window.addEventListener("online", refreshFromVisibilitySignal);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshFromVisibilitySignal);
      window.removeEventListener("online", refreshFromVisibilitySignal);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkForJobChanges, checkPipelineStatus, isRefreshPaused]);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      return;
    }

    const selectedJobListItem = jobListItems.find(
      (job) => job.id === selectedJobId,
    );
    if (!selectedJobListItem) {
      setSelectedJob(null);
      return;
    }

    const cached = selectedJobCacheRef.current.get(selectedJobId);
    if (cached && cached.updatedAt === selectedJobListItem.updatedAt) {
      setSelectedJob(cached);
      return;
    }

    void loadSelectedJob(selectedJobId);
  }, [jobListItems, loadSelectedJob, selectedJobId]);

  return {
    jobs: jobListItems,
    selectedJob,
    stats,
    isLoading,
    isPipelineRunning,
    setIsPipelineRunning,
    isRefreshPaused,
    setIsRefreshPaused,
    loadJobs,
    checkForJobChanges,
    checkPipelineStatus,
  };
};

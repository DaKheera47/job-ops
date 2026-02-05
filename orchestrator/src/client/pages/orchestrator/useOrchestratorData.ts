import type { Job, JobStatus } from "@shared/types";
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

export const useOrchestratorData = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Record<JobStatus, number>>(initialStats);
  const [isLoading, setIsLoading] = useState(true);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [isRefreshPaused, setIsRefreshPaused] = useState(false);
  const requestSeqRef = useRef(0);
  const latestAppliedSeqRef = useRef(0);
  const pendingLoadCountRef = useRef(0);

  const loadJobs = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    pendingLoadCountRef.current += 1;
    try {
      setIsLoading(true);
      const data = await api.getJobs();
      if (seq >= latestAppliedSeqRef.current) {
        latestAppliedSeqRef.current = seq;
        setJobs(data.jobs);
        setStats(data.byStatus);
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

  useEffect(() => {
    loadJobs();
    checkPipelineStatus();

    const interval = setInterval(() => {
      if (isRefreshPaused) return;
      loadJobs();
      checkPipelineStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadJobs, checkPipelineStatus, isRefreshPaused]);

  return {
    jobs,
    stats,
    isLoading,
    isPipelineRunning,
    setIsPipelineRunning,
    isRefreshPaused,
    setIsRefreshPaused,
    loadJobs,
    checkPipelineStatus,
  };
};

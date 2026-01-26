import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { Job, JobStatus } from "../../../shared/types";
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

  const loadJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.getJobs();
      setJobs(data.jobs);
      setStats(data.byStatus);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load jobs";
      toast.error(message);
    } finally {
      setIsLoading(false);
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
      loadJobs();
      checkPipelineStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadJobs, checkPipelineStatus]);

  return {
    jobs,
    stats,
    isLoading,
    isPipelineRunning,
    setIsPipelineRunning,
    loadJobs,
    checkPipelineStatus,
  };
};

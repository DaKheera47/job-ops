import type { Job, JobListItem, JobStatus } from "@shared/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";
import { subscribeToEventSource } from "../../lib/sse";

const initialStats: Record<JobStatus, number> = {
  discovered: 0,
  processing: 0,
  ready: 0,
  applied: 0,
  in_progress: 0,
  skipped: 0,
  expired: 0,
};

const isDocumentVisible = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

type PipelineProgressStep =
  | "idle"
  | "crawling"
  | "importing"
  | "scoring"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed";

type PipelineProgressEvent = {
  step: PipelineProgressStep;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

type PipelineTerminalStatus = "completed" | "cancelled" | "failed";

type PipelineTerminalEvent = {
  status: PipelineTerminalStatus;
  errorMessage: string | null;
  token: number;
};

type PipelineTerminalSnapshot = {
  status: PipelineTerminalStatus;
  errorMessage: string | null;
  signature: string;
};

const ACTIVE_PIPELINE_STEPS: ReadonlySet<PipelineProgressStep> = new Set([
  "crawling",
  "importing",
  "scoring",
  "processing",
]);

const TERMINAL_PIPELINE_STEPS: ReadonlySet<PipelineProgressStep> = new Set([
  "completed",
  "cancelled",
  "failed",
]);

const buildTerminalSignature = ({
  status,
  startedAt,
  completedAt,
  runId,
}: {
  status: PipelineTerminalStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  runId?: string | null;
}) => {
  if (startedAt || completedAt) {
    return `${status}:${startedAt ?? ""}:${completedAt ?? ""}`;
  }
  return `${status}:run:${runId ?? "unknown"}`;
};

export const useOrchestratorData = (selectedJobId: string | null) => {
  const [jobListItems, setJobListItems] = useState<JobListItem[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [stats, setStats] = useState<Record<JobStatus, number>>(initialStats);
  const [isLoading, setIsLoading] = useState(true);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [isPipelineSseConnected, setIsPipelineSseConnected] = useState(false);
  const [pipelineTerminalEvent, setPipelineTerminalEvent] =
    useState<PipelineTerminalEvent | null>(null);
  const [isRefreshPaused, setIsRefreshPaused] = useState(false);
  const requestSeqRef = useRef(0);
  const latestAppliedSeqRef = useRef(0);
  const pendingLoadCountRef = useRef(0);
  const selectedJobRequestSeqRef = useRef(0);
  const selectedJobCacheRef = useRef<Map<string, Job>>(new Map());
  const lastRevisionRef = useRef<string | null>(null);
  const lastSseRefreshAtRef = useRef(0);
  const hasHydratedPipelineStateRef = useRef(false);
  const seenRunningThisSessionRef = useRef(false);
  const baselineTerminalSignatureRef = useRef<string | null>(null);
  const lastTerminalSignatureRef = useRef<string | null>(null);
  const terminalEventTokenRef = useRef(0);

  const publishPipelineTerminal = useCallback(
    (status: PipelineTerminalStatus, errorMessage: string | null) => {
      terminalEventTokenRef.current += 1;
      setPipelineTerminalEvent({
        status,
        errorMessage,
        token: terminalEventTokenRef.current,
      });
    },
    [],
  );

  const observePipelineState = useCallback(
    (snapshot: {
      isRunning: boolean;
      terminal: PipelineTerminalSnapshot | null;
    }) => {
      setIsPipelineRunning(snapshot.isRunning);
      if (snapshot.isRunning) {
        seenRunningThisSessionRef.current = true;
      }

      if (!snapshot.terminal) {
        if (!hasHydratedPipelineStateRef.current) {
          hasHydratedPipelineStateRef.current = true;
        }
        return;
      }

      const signature = snapshot.terminal.signature;
      const isFirstPipelineObservation = !hasHydratedPipelineStateRef.current;

      if (isFirstPipelineObservation) {
        hasHydratedPipelineStateRef.current = true;
        baselineTerminalSignatureRef.current = signature;
        lastTerminalSignatureRef.current = signature;
        return;
      }

      if (signature === lastTerminalSignatureRef.current) {
        return;
      }

      lastTerminalSignatureRef.current = signature;
      if (!seenRunningThisSessionRef.current) {
        return;
      }

      if (signature === baselineTerminalSignatureRef.current) {
        return;
      }

      seenRunningThisSessionRef.current = false;
      publishPipelineTerminal(
        snapshot.terminal.status,
        snapshot.terminal.errorMessage,
      );
    },
    [publishPipelineTerminal],
  );

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
      const terminalStatus = status.lastRun?.status;

      if (status.isRunning) {
        observePipelineState({ isRunning: true, terminal: null });
        return;
      }

      if (
        !terminalStatus ||
        !TERMINAL_PIPELINE_STEPS.has(terminalStatus as PipelineProgressStep)
      ) {
        observePipelineState({ isRunning: false, terminal: null });
        return;
      }

      const terminal = terminalStatus as PipelineTerminalStatus;
      observePipelineState({
        isRunning: false,
        terminal: {
          status: terminal,
          errorMessage: status.lastRun?.errorMessage ?? null,
          signature: buildTerminalSignature({
            status: terminal,
            startedAt: status.lastRun?.startedAt ?? null,
            completedAt: status.lastRun?.completedAt ?? null,
            runId: status.lastRun?.id ?? null,
          }),
        },
      });
    } catch {
      // Ignore errors
    }
  }, [observePipelineState]);

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
    if (!isPipelineRunning) return;
    seenRunningThisSessionRef.current = true;
  }, [isPipelineRunning]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isDocumentVisible() || isRefreshPaused) return;
      void checkForJobChanges();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkForJobChanges, isRefreshPaused]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isDocumentVisible() || isRefreshPaused) return;
      void loadJobs();
    }, 600000);

    return () => clearInterval(interval);
  }, [isRefreshPaused, loadJobs]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshFromVisibilitySignal = () => {
      if (!isDocumentVisible() || isRefreshPaused) return;
      void checkForJobChanges();
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
  }, [checkForJobChanges, isRefreshPaused]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const unsubscribe = subscribeToEventSource<unknown>(
      "/api/pipeline/progress",
      {
        onOpen: () => {
          setIsPipelineSseConnected(true);
        },
        onMessage: (payload) => {
          if (!payload || typeof payload !== "object") return;
          const step = (payload as { step?: unknown }).step;
          if (typeof step !== "string") return;
          if (
            !ACTIVE_PIPELINE_STEPS.has(step as PipelineProgressStep) &&
            !TERMINAL_PIPELINE_STEPS.has(step as PipelineProgressStep) &&
            step !== "idle"
          ) {
            return;
          }

          const typedStep = step as PipelineProgressStep;
          const isActiveStep = ACTIVE_PIPELINE_STEPS.has(typedStep);
          if (isActiveStep) {
            observePipelineState({ isRunning: true, terminal: null });
          } else if (typedStep === "idle") {
            observePipelineState({ isRunning: false, terminal: null });
          }

          if (isActiveStep) {
            const now = Date.now();
            if (now - lastSseRefreshAtRef.current >= 2500) {
              lastSseRefreshAtRef.current = now;
              void checkForJobChanges();
            }
            return;
          }

          if (TERMINAL_PIPELINE_STEPS.has(typedStep)) {
            const eventPayload = payload as PipelineProgressEvent;
            const terminal = typedStep as PipelineTerminalStatus;
            observePipelineState({
              isRunning: false,
              terminal: {
                status: terminal,
                errorMessage: eventPayload.error ?? null,
                signature: buildTerminalSignature({
                  status: terminal,
                  startedAt: eventPayload.startedAt,
                  completedAt: eventPayload.completedAt,
                }),
              },
            });
            void loadJobs();
          }
        },
        onError: () => {
          setIsPipelineSseConnected(false);
        },
      },
    );

    return () => {
      unsubscribe();
    };
  }, [checkForJobChanges, loadJobs, observePipelineState]);

  useEffect(() => {
    if (isPipelineSseConnected) return;

    const interval = setInterval(() => {
      if (!isDocumentVisible() || isRefreshPaused) return;
      void checkPipelineStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkPipelineStatus, isPipelineSseConnected, isRefreshPaused]);

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
    pipelineTerminalEvent,
    isRefreshPaused,
    setIsRefreshPaused,
    loadJobs,
    checkForJobChanges,
    checkPipelineStatus,
  };
};

import {
  getPipelineProgressSnapshot,
  prepareChallengeViewer,
  resumePipelineScoring,
  solvePipelineChallenge,
} from "@client/api";
import type {
  PipelineFanoutProgress,
  PipelineProgressState,
} from "@shared/types";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { showErrorToast } from "@/client/lib/error-toast";
import { subscribeToEventSource } from "@/client/lib/sse";
import { PipelineFanoutCard } from "./PipelineFanoutCard";
import { PipelineProgressCard } from "./PipelineProgressCard";

interface PipelineProgressProps {
  isRunning: boolean;
}

const SSE_FALLBACK_TIMEOUT_MS = 1500;
const SNAPSHOT_POLL_INTERVAL_MS = 2000;
const TERMINAL_STEPS: ReadonlySet<PipelineProgressState["step"]> = new Set([
  "completed",
  "cancelled",
  "failed",
]);

const getCurrentCombination = (
  fanout: PipelineFanoutProgress,
  index: number,
): string | undefined => {
  if (
    fanout.sources.length === 0 ||
    fanout.roles.length === 0 ||
    fanout.locations.length === 0
  ) {
    return undefined;
  }

  const source = fanout.sources[index % fanout.sources.length];
  const role = fanout.roles[index % fanout.roles.length]?.role;
  const location = fanout.locations[index % fanout.locations.length];
  if (!source || !role || !location) return undefined;

  return `${source.toLowerCase()} · ${role.toLowerCase()} · ${location.toLowerCase()}`;
};

export const PipelineProgress: React.FC<PipelineProgressProps> = ({
  isRunning,
}) => {
  const [progress, setProgress] = useState<PipelineProgressState | null>(null);
  const [solvingExtractor, setSolvingExtractor] = useState<string | null>(null);
  const [resumingScoring, setResumingScoring] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const handleSolveChallenge = useCallback(async (extractorId: string) => {
    setSolvingExtractor(extractorId);
    const viewerWindow = window.open("about:blank", "_blank");
    if (viewerWindow) viewerWindow.opener = null;

    try {
      const viewer = await prepareChallengeViewer();
      if (viewer.available && viewer.viewerUrl) {
        if (viewerWindow) viewerWindow.location.href = viewer.viewerUrl;
        else window.open(viewer.viewerUrl, "_blank", "noopener");
      } else {
        viewerWindow?.close();
      }
      await solvePipelineChallenge(extractorId);
    } catch (error) {
      viewerWindow?.close();
      showErrorToast(error, "Failed to solve challenge");
    } finally {
      setSolvingExtractor(null);
    }
  }, []);

  const handleResumeScoring = useCallback(async () => {
    setResumingScoring(true);
    try {
      await resumePipelineScoring();
    } catch (error) {
      setResumingScoring(false);
      showErrorToast(error, "Failed to restart scoring");
    }
  }, []);

  useEffect(() => {
    if (!isRunning) {
      setProgress(null);
      return;
    }

    let isActive = true;
    let hasOpened = false;
    let isPolling = false;
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      isPolling = false;
      if (pollIntervalId) clearInterval(pollIntervalId);
      pollIntervalId = null;
    };

    const fetchSnapshot = async () => {
      try {
        const snapshot = await getPipelineProgressSnapshot();
        if (!isActive) return;
        setProgress(snapshot);
        if (TERMINAL_STEPS.has(snapshot.step)) stopPolling();
      } catch {
        // The next polling interval or SSE event retries the read.
      }
    };

    const startPolling = () => {
      if (!isActive || isPolling) return;
      isPolling = true;
      void fetchSnapshot();
      pollIntervalId = setInterval(() => {
        void fetchSnapshot();
      }, SNAPSHOT_POLL_INTERVAL_MS);
    };

    const unsubscribe = subscribeToEventSource<PipelineProgressState>(
      "/api/pipeline/progress",
      {
        onOpen: () => {
          if (!isActive) return;
          hasOpened = true;
          stopPolling();
        },
        onMessage: (payload) => {
          if (!isActive) return;
          setProgress(payload);
          if (TERMINAL_STEPS.has(payload.step)) stopPolling();
        },
        onError: startPolling,
      },
    );

    const fallbackTimeoutId = setTimeout(() => {
      if (!hasOpened) startPolling();
    }, SSE_FALLBACK_TIMEOUT_MS);

    return () => {
      isActive = false;
      clearTimeout(fallbackTimeoutId);
      stopPolling();
      unsubscribe();
    };
  }, [isRunning]);

  useEffect(() => {
    if (!progress?.fanout && progress?.step !== "scoring") return;
    setNow(Date.now());
    const intervalId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(intervalId);
  }, [progress?.fanout, progress?.step]);

  if (!isRunning || !progress) return null;

  const startedAt = progress.startedAt
    ? Date.parse(progress.startedAt)
    : Number.NaN;
  const elapsedSeconds = Number.isFinite(startedAt)
    ? Math.max(0, Math.floor((now - startedAt) / 1000))
    : 0;

  if (
    progress.step === "scoring" ||
    progress.step === "configuration_required"
  ) {
    return (
      <PipelineProgressCard
        progress={progress}
        elapsedSeconds={elapsedSeconds}
        resumingScoring={resumingScoring}
        onResumeScoring={handleResumeScoring}
      />
    );
  }

  if (
    !progress.fanout ||
    (progress.step !== "crawling" && progress.step !== "challenge_required")
  ) {
    return null;
  }

  return (
    <PipelineFanoutCard
      fanout={progress.fanout}
      elapsedSeconds={elapsedSeconds}
      currentCombination={getCurrentCombination(
        progress.fanout,
        elapsedSeconds,
      )}
      challenges={progress.pendingChallenges}
      solvingExtractor={solvingExtractor}
      onSolveChallenge={handleSolveChallenge}
    />
  );
};

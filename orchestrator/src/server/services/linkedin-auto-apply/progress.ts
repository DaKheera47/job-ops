import type { LinkedInApplyProgress } from "@shared/types";

type ProgressListener = (progress: LinkedInApplyProgress) => void;

const listeners = new Set<ProgressListener>();

let currentProgress: LinkedInApplyProgress = {
  step: "idle",
  message: "Idle",
  jobId: "",
};

export function getLinkedInApplyProgress(): LinkedInApplyProgress {
  return currentProgress;
}

export function updateLinkedInApplyProgress(
  progress: LinkedInApplyProgress,
): void {
  currentProgress = progress;
  for (const listener of listeners) {
    try {
      listener(progress);
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribeToLinkedInApplyProgress(
  listener: ProgressListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetProgress(): void {
  currentProgress = { step: "idle", message: "Idle", jobId: "" };
}

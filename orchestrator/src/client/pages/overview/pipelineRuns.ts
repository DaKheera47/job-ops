import type { PipelineRun } from "@shared/types";

export type PipelineRunDisplayStatus = PipelineRun["status"] | "incomplete";

export function getPipelineRunDisplayStatus(
  run: PipelineRun,
  options?: { isActive?: boolean },
): PipelineRunDisplayStatus {
  if (options?.isActive && run.status === "running") {
    return "running";
  }

  if (run.status === "running" && run.completedAt == null) {
    return "incomplete";
  }

  return run.status;
}

export function getPipelineRunStatusLabel(
  status: PipelineRunDisplayStatus,
): string {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "incomplete":
      return "Incomplete";
  }
}

export function formatPipelineDuration(durationMs: number | null): string {
  if (durationMs == null) return "—";

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

import type {
  JobSource,
  LocationMatchStrictness,
  LocationSearchScope,
  PipelineProgressState,
  PipelineRun,
  PipelineRunInsights,
  PipelineStatusResponse,
} from "@shared/types";
import { fetchApi } from "./core";

export async function getPipelineStatus(): Promise<PipelineStatusResponse> {
  return fetchApi<PipelineStatusResponse>("/pipeline/status");
}

export async function getPipelineProgressSnapshot(): Promise<PipelineProgressState> {
  return fetchApi<PipelineProgressState>("/pipeline/progress/snapshot");
}

export async function getPipelineRuns(): Promise<PipelineRun[]> {
  return fetchApi<PipelineRun[]>("/pipeline/runs");
}

export async function prepareChallengeViewer(): Promise<{
  available: boolean;
  viewerUrl: string | null;
  reason: string | null;
}> {
  return fetchApi<{
    available: boolean;
    viewerUrl: string | null;
    reason: string | null;
  }>("/pipeline/challenge-viewer", {
    method: "POST",
  });
}

export async function solvePipelineChallenge(extractorId: string): Promise<{
  status: "solved";
  extractorId: string;
  challengesRemaining: number;
}> {
  return fetchApi<{
    status: "solved";
    extractorId: string;
    challengesRemaining: number;
  }>("/pipeline/solve-challenge", {
    method: "POST",
    body: JSON.stringify({ extractorId }),
  });
}

export async function getPipelineRunInsights(
  id: string,
): Promise<PipelineRunInsights> {
  return fetchApi<PipelineRunInsights>(
    `/pipeline/runs/${encodeURIComponent(id)}/insights`,
  );
}

export async function runPipeline(config?: {
  topN?: number;
  minSuitabilityScore?: number;
  sources?: JobSource[];
  runBudget?: number;
  searchTerms?: string[];
  country?: string;
  cityLocations?: string[];
  workplaceTypes?: Array<"remote" | "hybrid" | "onsite">;
  searchScope?: LocationSearchScope;
  matchStrictness?: LocationMatchStrictness;
}): Promise<{ message: string }> {
  return fetchApi<{ message: string }>("/pipeline/run", {
    method: "POST",
    body: JSON.stringify(config || {}),
  });
}

export async function cancelPipeline(): Promise<{
  message: string;
  pipelineRunId: string | null;
  alreadyRequested: boolean;
}> {
  return fetchApi<{
    message: string;
    pipelineRunId: string | null;
    alreadyRequested: boolean;
  }>("/pipeline/cancel", {
    method: "POST",
  });
}

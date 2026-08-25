import type {
  CreatePipelineSearchPresetInput,
  JobSource,
  LocationMatchStrictness,
  LocationProximity,
  LocationSearchScope,
  PipelineProgressState,
  PipelineRun,
  PipelineRunInsights,
  PipelineSearchPlanRequest,
  PipelineSearchPlanResponse,
  PipelineSearchPreset,
  PipelineSearchPresetsResponse,
  PipelineStatusResponse,
  UpdatePipelineSearchPresetInput,
} from "@shared/types";
import { fetchApi } from "./core";

export async function getPipelineStatus(): Promise<PipelineStatusResponse> {
  return fetchApi<PipelineStatusResponse>("/pipeline/status");
}

export async function getPipelineProgressSnapshot(): Promise<PipelineProgressState> {
  return fetchApi<PipelineProgressState>("/pipeline/progress/snapshot");
}

export async function detectLocationCountry(point: {
  latitude: number;
  longitude: number;
}): Promise<{ country: string }> {
  return fetchApi<{ country: string }>("/pipeline/location-country", {
    method: "POST",
    body: JSON.stringify(point),
  });
}

export async function previewLocationArea(
  proximity: LocationProximity,
  signal?: AbortSignal,
): Promise<{ locations: string[] }> {
  return fetchApi<{ locations: string[] }>("/pipeline/location-area-preview", {
    method: "POST",
    body: JSON.stringify(proximity),
    signal,
  });
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
  cookiesSaved: number;
}> {
  return fetchApi<{
    status: "solved";
    extractorId: string;
    challengesRemaining: number;
    cookiesSaved: number;
  }>("/pipeline/solve-challenge", {
    method: "POST",
    body: JSON.stringify({ extractorId }),
  });
}

export async function resumePipelineScoring(): Promise<{ resolved: boolean }> {
  return fetchApi<{ resolved: boolean }>("/pipeline/resume-scoring", {
    method: "POST",
  });
}

export async function getPipelineRunInsights(
  id: string,
): Promise<PipelineRunInsights> {
  return fetchApi<PipelineRunInsights>(
    `/pipeline/runs/${encodeURIComponent(id)}/insights`,
  );
}

export async function getPipelineSearchPresets(): Promise<PipelineSearchPresetsResponse> {
  return fetchApi<PipelineSearchPresetsResponse>("/pipeline/search-presets");
}

export async function createPipelineSearchPreset(
  input: CreatePipelineSearchPresetInput,
): Promise<PipelineSearchPreset> {
  return fetchApi<PipelineSearchPreset>("/pipeline/search-presets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePipelineSearchPreset(
  id: string,
  input: UpdatePipelineSearchPresetInput,
): Promise<PipelineSearchPreset> {
  return fetchApi<PipelineSearchPreset>(
    `/pipeline/search-presets/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function markPipelineSearchPresetUsed(
  id: string,
): Promise<PipelineSearchPreset> {
  return fetchApi<PipelineSearchPreset>(
    `/pipeline/search-presets/${encodeURIComponent(id)}/used`,
    {
      method: "POST",
    },
  );
}

export async function deletePipelineSearchPreset(
  id: string,
): Promise<{ deleted: true }> {
  return fetchApi<{ deleted: true }>(
    `/pipeline/search-presets/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}

export async function planPipelineSearch(
  input: PipelineSearchPlanRequest,
): Promise<PipelineSearchPlanResponse> {
  return fetchApi<PipelineSearchPlanResponse>("/pipeline/search-plan", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function runPipeline(config?: {
  topN?: number;
  minSuitabilityScore?: number;
  sources?: JobSource[];
  runBudget?: number;
  searchTerms?: string[];
  scoringInstructions?: string;
  country?: string;
  cityLocations?: string[];
  proximity?: LocationProximity | null;
  workplaceTypes?: Array<"remote" | "hybrid" | "onsite">;
  searchScope?: LocationSearchScope;
  matchStrictness?: LocationMatchStrictness;
  watchlistSelectedSourceIds?: string[];
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

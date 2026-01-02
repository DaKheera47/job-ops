/**
 * API client for the orchestrator backend.
 */

import type {
  Job,
  ApiResponse,
  JobsListResponse,
  PipelineStatusResponse,
  JobSource,
  PipelineRun,
  AppSettings,
  ResumeProjectsSettings,
} from '../../shared/types';

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data.data as T;
}

// Jobs API
export async function getJobs(statuses?: string[]): Promise<JobsListResponse> {
  const query = statuses?.length ? `?status=${statuses.join(',')}` : '';
  return fetchApi<JobsListResponse>(`/jobs${query}`);
}

export async function getJob(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}`);
}

export async function updateJob(
  id: string,
  update: Partial<Job>
): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
}

export async function processJob(id: string, options?: { force?: boolean }): Promise<Job> {
  const query = options?.force ? '?force=1' : '';
  return fetchApi<Job>(`/jobs/${id}/process${query}`, {
    method: 'POST',
  });
}

export async function markAsApplied(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/apply`, {
    method: 'POST',
  });
}

export async function rejectJob(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/reject`, {
    method: 'POST',
  });
}

// Pipeline API
export async function getPipelineStatus(): Promise<PipelineStatusResponse> {
  return fetchApi<PipelineStatusResponse>('/pipeline/status');
}

export async function getPipelineRuns(): Promise<PipelineRun[]> {
  return fetchApi<PipelineRun[]>('/pipeline/runs');
}

export async function runPipeline(config?: {
  topN?: number;
  minSuitabilityScore?: number;
  sources?: JobSource[];
}): Promise<{ message: string }> {
  return fetchApi<{ message: string }>('/pipeline/run', {
    method: 'POST',
    body: JSON.stringify(config || {}),
  });
}

// Settings API
export async function getSettings(): Promise<AppSettings> {
  return fetchApi<AppSettings>('/settings');
}

export async function updateSettings(update: {
  model?: string | null
  pipelineWebhookUrl?: string | null
  jobCompleteWebhookUrl?: string | null
  resumeProjects?: ResumeProjectsSettings | null
  ukvisajobsMaxJobs?: number | null
  searchTerms?: string[] | null
  jobspyLocation?: string | null
  jobspyResultsWanted?: number | null
  jobspyHoursOld?: number | null
  jobspyCountryIndeed?: string | null
  jobspyLinkedinFetchDescription?: boolean | null
}): Promise<AppSettings> {
  return fetchApi<AppSettings>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
}

// Database API
export async function clearDatabase(): Promise<{
  message: string;
  jobsDeleted: number;
  runsDeleted: number;
}> {
  return fetchApi<{
    message: string;
    jobsDeleted: number;
    runsDeleted: number;
  }>('/database', {
    method: 'DELETE',
  });
}

export async function deleteJobsByStatus(status: string): Promise<{
  message: string;
  count: number;
}> {
  return fetchApi<{
    message: string;
    count: number;
  }>(`/jobs/status/${status}`, {
    method: 'DELETE',
  });
}

// Bulk operations (intentionally none - processing is manual)

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
  ResumeProjectCatalogItem,
  UkVisaJobsSearchResponse,
  UkVisaJobsImportResponse,
  CreateJobInput,
  ManualJobDraft,
  ManualJobInferenceResponse,
  VisaSponsorSearchResponse,
  VisaSponsorStatusResponse,
  VisaSponsor,
  ResumeProfile,
} from '../../shared/types';
import { trackEvent } from "@/lib/analytics";

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

export async function summarizeJob(id: string, options?: { force?: boolean }): Promise<Job> {
  const query = options?.force ? '?force=1' : '';
  return fetchApi<Job>(`/jobs/${id}/summarize${query}`, {
    method: 'POST',
  });
}

export async function generateJobPdf(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/generate-pdf`, {
    method: 'POST',
  });
}

export async function checkSponsor(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/check-sponsor`, {
    method: 'POST',
  });
}

export async function markAsApplied(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/apply`, {
    method: 'POST',
  });
}

export async function skipJob(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/skip`, {
    method: 'POST',
  });
}

// Pipeline API
export async function getPipelineStatus(): Promise<PipelineStatusResponse> {
  return fetchApi<PipelineStatusResponse>('/pipeline/status');
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

// UK Visa Jobs API
export async function searchUkVisaJobs(input: {
  searchTerm?: string;
  page?: number;
}): Promise<UkVisaJobsSearchResponse> {
  if (input.searchTerm?.trim()) {
    trackEvent('ukvisajobs_search', {
      searchTerm: input.searchTerm.trim(),
      page: input.page ?? 1,
    });
  }
  return fetchApi<UkVisaJobsSearchResponse>('/ukvisajobs/search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function importUkVisaJobs(input: {
  jobs: CreateJobInput[];
}): Promise<UkVisaJobsImportResponse> {
  return fetchApi<UkVisaJobsImportResponse>('/ukvisajobs/import', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Manual Job Import API
export async function inferManualJob(input: {
  jobDescription: string;
}): Promise<ManualJobInferenceResponse> {
  return fetchApi<ManualJobInferenceResponse>('/manual-jobs/infer', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function importManualJob(input: {
  job: ManualJobDraft;
}): Promise<Job> {
  return fetchApi<Job>('/manual-jobs/import', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Settings & Profile API
export async function getSettings(): Promise<AppSettings> {
  return fetchApi<AppSettings>('/settings');
}

export async function getProfileProjects(): Promise<ResumeProjectCatalogItem[]> {
  return fetchApi<ResumeProjectCatalogItem[]>('/profile/projects');
}

export async function getProfile(): Promise<ResumeProfile> {
  return fetchApi<ResumeProfile>('/profile');
}


export async function updateSettings(update: {
  model?: string | null
  modelScorer?: string | null
  modelTailoring?: string | null
  modelProjectSelection?: string | null
  pipelineWebhookUrl?: string | null
  jobCompleteWebhookUrl?: string | null
  resumeProjects?: ResumeProjectsSettings | null
  ukvisajobsMaxJobs?: number | null
  gradcrackerMaxJobsPerTerm?: number | null
  searchTerms?: string[] | null
  jobspyLocation?: string | null
  jobspyResultsWanted?: number | null
  jobspyHoursOld?: number | null
  jobspyCountryIndeed?: string | null
  jobspySites?: string[] | null
  jobspyLinkedinFetchDescription?: boolean | null
  showSponsorInfo?: boolean | null
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

// Visa Sponsors API
export async function getVisaSponsorStatus(): Promise<VisaSponsorStatusResponse> {
  return fetchApi<VisaSponsorStatusResponse>('/visa-sponsors/status');
}

export async function searchVisaSponsors(input: {
  query: string;
  limit?: number;
  minScore?: number;
}): Promise<VisaSponsorSearchResponse> {
  if (input.query?.trim()) {
    trackEvent('visa_sponsor_search', {
      query: input.query.trim(),
      limit: input.limit,
      minScore: input.minScore,
    });
  }
  return fetchApi<VisaSponsorSearchResponse>('/visa-sponsors/search', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getVisaSponsorOrganization(name: string): Promise<VisaSponsor[]> {
  return fetchApi<VisaSponsor[]>(`/visa-sponsors/organization/${encodeURIComponent(name)}`);
}

export async function updateVisaSponsorList(): Promise<{
  message: string;
  status: VisaSponsorStatusResponse;
}> {
  return fetchApi<{
    message: string;
    status: VisaSponsorStatusResponse;
  }>('/visa-sponsors/update', {
    method: 'POST',
  });
}

// Bulk operations (intentionally none - processing is manual)

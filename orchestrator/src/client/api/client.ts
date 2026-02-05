/**
 * API client for the orchestrator backend.
 */

import type {
  ApiResponse,
  ApplicationStage,
  ApplicationTask,
  AppSettings,
  BackupInfo,
  BulkJobActionRequest,
  BulkJobActionResponse,
  CreateJobInput,
  DemoInfoResponse,
  Job,
  JobOutcome,
  JobSource,
  JobsListResponse,
  ManualJobDraft,
  ManualJobFetchResponse,
  ManualJobInferenceResponse,
  PipelineStatusResponse,
  ProfileStatusResponse,
  ResumeProfile,
  ResumeProjectCatalogItem,
  ResumeProjectsSettings,
  StageEvent,
  StageEventMetadata,
  StageTransitionTarget,
  UkVisaJobsImportResponse,
  UkVisaJobsSearchResponse,
  ValidationResult,
  VisaSponsor,
  VisaSponsorSearchResponse,
  VisaSponsorStatusResponse,
} from "@shared/types";
import { trackEvent } from "@/lib/analytics";
import { showDemoBlockedToast, showDemoSimulatedToast } from "@/lib/demo-toast";

const API_BASE = "/api";

class ApiClientError extends Error {
  requestId?: string;

  constructor(message: string, requestId?: string) {
    super(requestId ? `${message} (requestId: ${requestId})` : message);
    this.name = "ApiClientError";
    this.requestId = requestId;
  }
}

type LegacyApiResponse<T> =
  | {
      success: true;
      data?: T;
      message?: string;
    }
  | {
      success: false;
      error?: string;
      message?: string;
      details?: unknown;
    };

function normalizeApiResponse<T>(
  payload: unknown,
): ApiResponse<T> | LegacyApiResponse<T> {
  if (!payload || typeof payload !== "object") {
    throw new ApiClientError("API request failed: malformed JSON response");
  }
  const response = payload as Record<string, unknown>;
  if (typeof response.ok === "boolean") {
    return payload as ApiResponse<T>;
  }
  if (typeof response.success === "boolean") {
    return payload as LegacyApiResponse<T>;
  }
  throw new ApiClientError("API request failed: unexpected response shape");
}

function describeAction(endpoint: string, method?: string): string {
  const verb = (method || "GET").toUpperCase();
  const normalized = endpoint.split("?")[0] || endpoint;
  if (verb === "POST" && normalized === "/pipeline/run") {
    return "Pipeline run used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/process")) {
    return "Job processing used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/summarize")) {
    return "Summary generation used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/generate-pdf")) {
    return "PDF generation used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/rescore")) {
    return "Suitability rescoring used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/apply")) {
    return "Apply flow used demo simulation and no external sync.";
  }
  if (normalized.startsWith("/onboarding/validate")) {
    return "Credential validation is simulated in demo mode.";
  }
  return "This action ran in demo simulation mode.";
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const text = await response.text();

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    // If the response is not JSON, it's likely an HTML error page
    console.error("API returned non-JSON response:", text.substring(0, 500));
    throw new ApiClientError(
      `Server error (${response.status}): Expected JSON but received HTML. Is the backend server running?`,
    );
  }
  const parsed = normalizeApiResponse<T>(payload);

  if ("ok" in parsed) {
    if (!parsed.ok) {
      if (parsed.meta?.blockedReason) {
        showDemoBlockedToast(parsed.meta.blockedReason);
      }
      throw new ApiClientError(
        parsed.error.message || "API request failed",
        parsed.meta?.requestId,
      );
    }
    if (parsed.meta?.simulated) {
      showDemoSimulatedToast(describeAction(endpoint, options?.method));
    }
    return parsed.data as T;
  }

  if (!parsed.success) {
    throw new ApiClientError(
      parsed.error || parsed.message || "API request failed",
    );
  }

  const data = parsed.data;
  if (data !== undefined) return data as T;
  if (parsed.message !== undefined) return { message: parsed.message } as T;
  return null as T;
}

// Jobs API
export async function getJobs(statuses?: string[]): Promise<JobsListResponse> {
  const query = statuses?.length ? `?status=${statuses.join(",")}` : "";
  return fetchApi<JobsListResponse>(`/jobs${query}`);
}

export async function getJob(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}?t=${Date.now()}`);
}

export async function updateJob(
  id: string,
  update: Partial<Job>,
): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export async function processJob(
  id: string,
  options?: { force?: boolean },
): Promise<Job> {
  const query = options?.force ? "?force=1" : "";
  return fetchApi<Job>(`/jobs/${id}/process${query}`, {
    method: "POST",
  });
}

export async function rescoreJob(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/rescore`, {
    method: "POST",
  });
}

export async function summarizeJob(
  id: string,
  options?: { force?: boolean },
): Promise<Job> {
  const query = options?.force ? "?force=1" : "";
  return fetchApi<Job>(`/jobs/${id}/summarize${query}`, {
    method: "POST",
  });
}

export async function generateJobPdf(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/generate-pdf`, {
    method: "POST",
  });
}

export async function checkSponsor(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/check-sponsor`, {
    method: "POST",
  });
}

export async function markAsApplied(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/apply`, {
    method: "POST",
  });
}

export async function skipJob(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/skip`, {
    method: "POST",
  });
}

export async function bulkJobAction(
  input: BulkJobActionRequest,
): Promise<BulkJobActionResponse> {
  return fetchApi<BulkJobActionResponse>("/jobs/bulk-actions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getJobStageEvents(id: string): Promise<StageEvent[]> {
  return fetchApi<StageEvent[]>(`/jobs/${id}/events?t=${Date.now()}`);
}

export async function getJobTasks(
  id: string,
  options?: { includeCompleted?: boolean },
): Promise<ApplicationTask[]> {
  const params = new URLSearchParams();
  if (options?.includeCompleted) params.set("includeCompleted", "1");
  params.set("t", Date.now().toString());
  const query = params.toString();
  return fetchApi<ApplicationTask[]>(`/jobs/${id}/tasks?${query}`);
}

export async function transitionJobStage(
  id: string,
  input: {
    toStage: StageTransitionTarget;
    occurredAt?: number | null;
    metadata?: StageEventMetadata | null;
    outcome?: JobOutcome | null;
  },
): Promise<StageEvent> {
  return fetchApi<StageEvent>(`/jobs/${id}/stages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateJobStageEvent(
  id: string,
  eventId: string,
  input: {
    toStage?: ApplicationStage;
    occurredAt?: number | null;
    metadata?: StageEventMetadata | null;
    outcome?: JobOutcome | null;
  },
): Promise<void> {
  return fetchApi<void>(`/jobs/${id}/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteJobStageEvent(
  id: string,
  eventId: string,
): Promise<void> {
  return fetchApi<void>(`/jobs/${id}/events/${eventId}`, {
    method: "DELETE",
  });
}

export async function updateJobOutcome(
  id: string,
  input: { outcome: JobOutcome | null; closedAt?: number | null },
): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}/outcome`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// Pipeline API
export async function getPipelineStatus(): Promise<PipelineStatusResponse> {
  return fetchApi<PipelineStatusResponse>("/pipeline/status");
}

export async function runPipeline(config?: {
  topN?: number;
  minSuitabilityScore?: number;
  sources?: JobSource[];
}): Promise<{ message: string }> {
  return fetchApi<{ message: string }>("/pipeline/run", {
    method: "POST",
    body: JSON.stringify(config || {}),
  });
}

export async function getDemoInfo(): Promise<DemoInfoResponse> {
  return fetchApi<DemoInfoResponse>("/demo/info");
}

// UK Visa Jobs API
export async function searchUkVisaJobs(input: {
  searchTerm?: string;
  page?: number;
}): Promise<UkVisaJobsSearchResponse> {
  if (input.searchTerm?.trim()) {
    trackEvent("ukvisajobs_search", {
      searchTerm: input.searchTerm.trim(),
      page: input.page ?? 1,
    });
  }
  return fetchApi<UkVisaJobsSearchResponse>("/ukvisajobs/search", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function importUkVisaJobs(input: {
  jobs: CreateJobInput[];
}): Promise<UkVisaJobsImportResponse> {
  return fetchApi<UkVisaJobsImportResponse>("/ukvisajobs/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Manual Job Import API
export async function fetchJobFromUrl(input: {
  url: string;
}): Promise<ManualJobFetchResponse> {
  return fetchApi<ManualJobFetchResponse>("/manual-jobs/fetch", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function inferManualJob(input: {
  jobDescription: string;
}): Promise<ManualJobInferenceResponse> {
  return fetchApi<ManualJobInferenceResponse>("/manual-jobs/infer", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function importManualJob(input: {
  job: ManualJobDraft;
}): Promise<Job> {
  return fetchApi<Job>("/manual-jobs/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Settings & Profile API
let settingsPromise: Promise<AppSettings> | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (settingsPromise) return settingsPromise;

  settingsPromise = fetchApi<AppSettings>("/settings").finally(() => {
    // Clear the promise after a short delay to allow subsequent fresh fetches
    // but coalesce simultaneous requests.
    setTimeout(() => {
      settingsPromise = null;
    }, 100);
  });

  return settingsPromise;
}

export async function getProfileProjects(): Promise<
  ResumeProjectCatalogItem[]
> {
  return fetchApi<ResumeProjectCatalogItem[]>("/profile/projects");
}

export async function getResumeProjectsCatalog(): Promise<
  ResumeProjectCatalogItem[]
> {
  try {
    const settings = await getSettings();
    if (settings.rxresumeBaseResumeId) {
      return await getRxResumeProjects(settings.rxresumeBaseResumeId);
    }
  } catch {
    // fall through to profile-based projects
  }

  return getProfileProjects();
}

export async function getProfile(): Promise<ResumeProfile> {
  return fetchApi<ResumeProfile>("/profile");
}

export async function getProfileStatus(): Promise<ProfileStatusResponse> {
  return fetchApi<ProfileStatusResponse>("/profile/status");
}

export async function refreshProfile(): Promise<ResumeProfile> {
  return fetchApi<ResumeProfile>("/profile/refresh", {
    method: "POST",
  });
}

export async function validateLlm(input: {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<ValidationResult> {
  return fetchApi<ValidationResult>("/onboarding/validate/llm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function validateRxresume(
  email?: string,
  password?: string,
): Promise<ValidationResult> {
  return fetchApi<ValidationResult>("/onboarding/validate/rxresume", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function validateResumeConfig(): Promise<ValidationResult> {
  return fetchApi<ValidationResult>("/onboarding/validate/resume");
}

export async function updateSettings(update: {
  model?: string | null;
  modelScorer?: string | null;
  modelTailoring?: string | null;
  modelProjectSelection?: string | null;
  llmProvider?: string | null;
  llmBaseUrl?: string | null;
  llmApiKey?: string | null;
  pipelineWebhookUrl?: string | null;
  jobCompleteWebhookUrl?: string | null;
  resumeProjects?: ResumeProjectsSettings | null;
  ukvisajobsMaxJobs?: number | null;
  gradcrackerMaxJobsPerTerm?: number | null;
  searchTerms?: string[] | null;
  jobspyLocation?: string | null;
  jobspyResultsWanted?: number | null;
  jobspyHoursOld?: number | null;
  jobspyCountryIndeed?: string | null;
  jobspySites?: string[] | null;
  jobspyLinkedinFetchDescription?: boolean | null;
  showSponsorInfo?: boolean | null;
  openrouterApiKey?: string | null;
  rxresumeEmail?: string | null;
  rxresumePassword?: string | null;
  basicAuthUser?: string | null;
  basicAuthPassword?: string | null;
  ukvisajobsEmail?: string | null;
  ukvisajobsPassword?: string | null;
  webhookSecret?: string | null;
  rxresumeBaseResumeId?: string | null;
}): Promise<AppSettings> {
  return fetchApi<AppSettings>("/settings", {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export async function getRxResumes(): Promise<{ id: string; name: string }[]> {
  const data = await fetchApi<{ resumes: { id: string; name: string }[] }>(
    "/settings/rx-resumes",
  );
  return data.resumes;
}

export async function getRxResumeProjects(
  resumeId: string,
  signal?: AbortSignal,
): Promise<ResumeProjectCatalogItem[]> {
  const data = await fetchApi<{ projects: ResumeProjectCatalogItem[] }>(
    `/settings/rx-resumes/${encodeURIComponent(resumeId)}/projects`,
    { signal },
  );
  return data.projects;
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
  }>("/database", {
    method: "DELETE",
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
    method: "DELETE",
  });
}

export async function deleteJobsBelowScore(threshold: number): Promise<{
  message: string;
  count: number;
  threshold: number;
}> {
  return fetchApi<{
    message: string;
    count: number;
    threshold: number;
  }>(`/jobs/score/${threshold}`, {
    method: "DELETE",
  });
}

// Visa Sponsors API
export async function getVisaSponsorStatus(): Promise<VisaSponsorStatusResponse> {
  return fetchApi<VisaSponsorStatusResponse>("/visa-sponsors/status");
}

export async function searchVisaSponsors(input: {
  query: string;
  limit?: number;
  minScore?: number;
}): Promise<VisaSponsorSearchResponse> {
  if (input.query?.trim()) {
    trackEvent("visa_sponsor_search", {
      query: input.query.trim(),
      limit: input.limit,
      minScore: input.minScore,
    });
  }
  return fetchApi<VisaSponsorSearchResponse>("/visa-sponsors/search", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getVisaSponsorOrganization(
  name: string,
): Promise<VisaSponsor[]> {
  return fetchApi<VisaSponsor[]>(
    `/visa-sponsors/organization/${encodeURIComponent(name)}`,
  );
}

export async function updateVisaSponsorList(): Promise<{
  message: string;
  status: VisaSponsorStatusResponse;
}> {
  return fetchApi<{
    message: string;
    status: VisaSponsorStatusResponse;
  }>("/visa-sponsors/update", {
    method: "POST",
  });
}

// Bulk operations (intentionally none - processing is manual)

// Backup API
export interface BackupListResponse {
  backups: BackupInfo[];
  nextScheduled: string | null;
}

export async function getBackups(): Promise<BackupListResponse> {
  return fetchApi<BackupListResponse>("/backups");
}

export async function createManualBackup(): Promise<BackupInfo> {
  return fetchApi<BackupInfo>("/backups", {
    method: "POST",
  });
}

export async function deleteBackup(filename: string): Promise<void> {
  await fetchApi<void>(`/backups/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
}

/**
 * API client for the orchestrator backend.
 */

import type { UpdateSettingsInput } from "@shared/settings-schema";
import type {
  ApiResponse,
  ApplicationStage,
  ApplicationTask,
  AppSettings,
  BackupInfo,
  BulkJobActionRequest,
  BulkJobActionResponse,
  BulkPostApplicationAction,
  BulkPostApplicationActionResponse,
  DemoInfoResponse,
  Job,
  JobListItem,
  JobOutcome,
  JobSource,
  JobsListResponse,
  JobsRevisionResponse,
  ManualJobDraft,
  ManualJobFetchResponse,
  ManualJobInferenceResponse,
  PipelineStatusResponse,
  PostApplicationInboxItem,
  PostApplicationProvider,
  PostApplicationProviderActionResponse,
  PostApplicationRouterStageTarget,
  PostApplicationSyncRun,
  ProfileStatusResponse,
  ResumeProfile,
  ResumeProjectCatalogItem,
  StageEvent,
  StageEventMetadata,
  StageTransitionTarget,
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
  status?: number;
  code?: string;

  constructor(
    message: string,
    options?: { requestId?: string; status?: number; code?: string },
  ) {
    const requestId = options?.requestId;
    super(requestId ? `${message} (requestId: ${requestId})` : message);
    this.name = "ApiClientError";
    this.requestId = requestId;
    this.status = options?.status;
    this.code = options?.code;
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

export type BasicAuthCredentials = {
  username: string;
  password: string;
};

export type BasicAuthPromptRequest = {
  endpoint: string;
  method: string;
  attempt: number;
  usernameHint?: string;
  errorMessage?: string;
};

type BasicAuthPromptHandler = (
  request: BasicAuthPromptRequest,
) => Promise<BasicAuthCredentials | null>;

let basicAuthPromptHandler: BasicAuthPromptHandler | null = null;
let basicAuthPromptInFlight: Promise<BasicAuthCredentials | null> | null = null;
let cachedBasicAuthCredentials: BasicAuthCredentials | null = null;

export function setBasicAuthPromptHandler(
  handler: BasicAuthPromptHandler | null,
): void {
  basicAuthPromptHandler = handler;
}

export function clearBasicAuthCredentials(): void {
  cachedBasicAuthCredentials = null;
}

export function __resetApiClientAuthForTests(): void {
  basicAuthPromptHandler = null;
  basicAuthPromptInFlight = null;
  cachedBasicAuthCredentials = null;
}

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

function encodeBasicAuth(credentials: BasicAuthCredentials): string {
  return `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const next: Record<string, string> = {};
    headers.forEach((value, key) => {
      next[key] = value;
    });
    return next;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

function isWriteMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function isUnauthorizedResponse<T>(
  response: Response,
  parsed: ApiResponse<T> | LegacyApiResponse<T>,
): boolean {
  if (response.status !== 401) return false;
  if ("ok" in parsed) {
    return parsed.ok ? false : parsed.error.code === "UNAUTHORIZED";
  }
  return !parsed.success;
}

function toApiError<T>(
  response: Response,
  parsed: ApiResponse<T> | LegacyApiResponse<T>,
): ApiClientError {
  if ("ok" in parsed) {
    if (!parsed.ok) {
      return new ApiClientError(parsed.error.message || "API request failed", {
        requestId: parsed.meta?.requestId,
        status: response.status,
        code: parsed.error.code,
      });
    }
    return new ApiClientError("API request failed", {
      requestId: parsed.meta?.requestId,
      status: response.status,
    });
  }
  if (parsed.success) {
    return new ApiClientError(parsed.message || "API request failed", {
      status: response.status,
    });
  }
  return new ApiClientError(
    parsed.error || parsed.message || "API request failed",
    {
      status: response.status,
    },
  );
}

async function requestBasicAuthCredentials(
  request: BasicAuthPromptRequest,
): Promise<BasicAuthCredentials | null> {
  if (!basicAuthPromptHandler) return null;
  if (!basicAuthPromptInFlight) {
    basicAuthPromptInFlight = basicAuthPromptHandler(request).finally(() => {
      basicAuthPromptInFlight = null;
    });
  }
  return basicAuthPromptInFlight;
}

async function fetchAndParse<T>(
  endpoint: string,
  options: RequestInit | undefined,
  authHeader?: string,
): Promise<{
  response: Response;
  parsed: ApiResponse<T> | LegacyApiResponse<T>;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...normalizeHeaders(options?.headers),
  };
  if (authHeader) headers.Authorization = authHeader;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const text = await response.text();

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    // If the response is not JSON, it's likely an HTML error page.
    throw new ApiClientError(
      `Server error (${response.status}): Expected JSON but received HTML. Is the backend server running?`,
      { status: response.status },
    );
  }
  const parsed = normalizeApiResponse<T>(payload);
  return { response, parsed };
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const method = (options?.method || "GET").toUpperCase();
  let authHeader = cachedBasicAuthCredentials
    ? encodeBasicAuth(cachedBasicAuthCredentials)
    : undefined;
  let authAttempt = 0;
  let usernameHint = cachedBasicAuthCredentials?.username;

  while (true) {
    const { response, parsed } = await fetchAndParse(
      endpoint,
      options,
      authHeader,
    );

    if (
      isWriteMethod(method) &&
      isUnauthorizedResponse(response, parsed) &&
      basicAuthPromptHandler &&
      authAttempt < 2
    ) {
      const credentials = await requestBasicAuthCredentials({
        endpoint,
        method,
        attempt: authAttempt + 1,
        usernameHint,
        errorMessage:
          authAttempt > 0
            ? "Invalid credentials. Please try again."
            : undefined,
      });
      if (!credentials) {
        throw toApiError(response, parsed);
      }
      cachedBasicAuthCredentials = credentials;
      usernameHint = credentials.username;
      authHeader = encodeBasicAuth(credentials);
      authAttempt += 1;
      continue;
    }

    if ("ok" in parsed) {
      if (!parsed.ok) {
        if (parsed.error.code === "UNAUTHORIZED") {
          clearBasicAuthCredentials();
        }
        if (parsed.meta?.blockedReason) {
          showDemoBlockedToast(parsed.meta.blockedReason);
        }
        throw toApiError(response, parsed);
      }
      if (parsed.meta?.simulated) {
        showDemoSimulatedToast(describeAction(endpoint, options?.method));
      }
      return parsed.data as T;
    }

    if (!parsed.success) {
      if (response.status === 401) {
        clearBasicAuthCredentials();
      }
      throw toApiError(response, parsed);
    }

    const data = parsed.data;
    if (data !== undefined) return data as T;
    if (parsed.message !== undefined) return { message: parsed.message } as T;
    return null as T;
  }
}

// Jobs API
export function getJobs(): Promise<JobsListResponse<JobListItem>>;
export function getJobs(options: {
  statuses?: string[];
  view?: "list";
}): Promise<JobsListResponse<JobListItem>>;
export function getJobs(options?: {
  statuses?: string[];
  view: "full";
}): Promise<JobsListResponse<Job>>;
export async function getJobs(options?: {
  statuses?: string[];
  view?: "full" | "list";
}): Promise<JobsListResponse<Job> | JobsListResponse<JobListItem>> {
  const params = new URLSearchParams();
  if (options?.statuses?.length)
    params.set("status", options.statuses.join(","));
  if (options?.view) params.set("view", options.view);
  const query = params.toString();
  return fetchApi<JobsListResponse<Job> | JobsListResponse<JobListItem>>(
    `/jobs${query ? `?${query}` : ""}`,
  );
}

export async function getJobsRevision(options?: {
  statuses?: string[];
}): Promise<JobsRevisionResponse> {
  const params = new URLSearchParams();
  if (options?.statuses?.length)
    params.set("status", options.statuses.join(","));
  const query = params.toString();
  return fetchApi<JobsRevisionResponse>(
    `/jobs/revision${query ? `?${query}` : ""}`,
  );
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

// Post-Application Tracking API
export async function postApplicationProviderConnect(input: {
  provider?: PostApplicationProvider;
  accountKey?: string;
  payload?: Record<string, unknown>;
}): Promise<PostApplicationProviderActionResponse> {
  const provider = input.provider ?? "gmail";
  return fetchApi<PostApplicationProviderActionResponse>(
    `/post-application/providers/${provider}/actions/connect`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input.accountKey ? { accountKey: input.accountKey } : {}),
        ...(input.payload ? { payload: input.payload } : {}),
      }),
    },
  );
}

export async function postApplicationGmailOauthStart(input?: {
  accountKey?: string;
}): Promise<{
  provider: "gmail";
  accountKey: string;
  authorizationUrl: string;
  state: string;
}> {
  const params = new URLSearchParams();
  if (input?.accountKey) params.set("accountKey", input.accountKey);
  const query = params.toString();
  return fetchApi<{
    provider: "gmail";
    accountKey: string;
    authorizationUrl: string;
    state: string;
  }>(
    `/post-application/providers/gmail/oauth/start${query ? `?${query}` : ""}`,
  );
}

export async function postApplicationGmailOauthExchange(input: {
  accountKey?: string;
  state: string;
  code: string;
}): Promise<PostApplicationProviderActionResponse> {
  return fetchApi<PostApplicationProviderActionResponse>(
    "/post-application/providers/gmail/oauth/exchange",
    {
      method: "POST",
      body: JSON.stringify({
        ...(input.accountKey ? { accountKey: input.accountKey } : {}),
        state: input.state,
        code: input.code,
      }),
    },
  );
}

export async function postApplicationProviderStatus(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
}): Promise<PostApplicationProviderActionResponse> {
  const provider = input?.provider ?? "gmail";
  return fetchApi<PostApplicationProviderActionResponse>(
    `/post-application/providers/${provider}/actions/status`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input?.accountKey ? { accountKey: input.accountKey } : {}),
      }),
    },
  );
}

export async function postApplicationProviderSync(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
  maxMessages?: number;
  searchDays?: number;
}): Promise<PostApplicationProviderActionResponse> {
  const provider = input?.provider ?? "gmail";
  return fetchApi<PostApplicationProviderActionResponse>(
    `/post-application/providers/${provider}/actions/sync`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input?.accountKey ? { accountKey: input.accountKey } : {}),
        ...(typeof input?.maxMessages === "number"
          ? { maxMessages: input.maxMessages }
          : {}),
        ...(typeof input?.searchDays === "number"
          ? { searchDays: input.searchDays }
          : {}),
      }),
    },
  );
}

export async function postApplicationProviderDisconnect(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
}): Promise<PostApplicationProviderActionResponse> {
  const provider = input?.provider ?? "gmail";
  return fetchApi<PostApplicationProviderActionResponse>(
    `/post-application/providers/${provider}/actions/disconnect`,
    {
      method: "POST",
      body: JSON.stringify({
        ...(input?.accountKey ? { accountKey: input.accountKey } : {}),
      }),
    },
  );
}

export async function getPostApplicationInbox(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
  limit?: number;
}): Promise<{ items: PostApplicationInboxItem[]; total: number }> {
  const params = new URLSearchParams();
  params.set("provider", input?.provider ?? "gmail");
  params.set("accountKey", input?.accountKey ?? "default");
  if (typeof input?.limit === "number")
    params.set("limit", String(input.limit));
  const query = params.toString();
  return fetchApi<{ items: PostApplicationInboxItem[]; total: number }>(
    `/post-application/inbox?${query}`,
  );
}

export async function approvePostApplicationInboxItem(input: {
  messageId: string;
  provider?: PostApplicationProvider;
  accountKey?: string;
  jobId?: string;
  stageTarget?: PostApplicationRouterStageTarget;
  toStage?: ApplicationStage;
  note?: string;
  decidedBy?: string;
}): Promise<{
  message: PostApplicationInboxItem["message"];
  stageEventId: string | null;
}> {
  return fetchApi<{
    message: PostApplicationInboxItem["message"];
    stageEventId: string | null;
  }>(`/post-application/inbox/${encodeURIComponent(input.messageId)}/approve`, {
    method: "POST",
    body: JSON.stringify({
      provider: input.provider ?? "gmail",
      accountKey: input.accountKey ?? "default",
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.stageTarget ? { stageTarget: input.stageTarget } : {}),
      ...(input.toStage ? { toStage: input.toStage } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
    }),
  });
}

export async function denyPostApplicationInboxItem(input: {
  messageId: string;
  provider?: PostApplicationProvider;
  accountKey?: string;
  decidedBy?: string;
}): Promise<{
  message: PostApplicationInboxItem["message"];
}> {
  return fetchApi<{ message: PostApplicationInboxItem["message"] }>(
    `/post-application/inbox/${encodeURIComponent(input.messageId)}/deny`,
    {
      method: "POST",
      body: JSON.stringify({
        provider: input.provider ?? "gmail",
        accountKey: input.accountKey ?? "default",
        ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
      }),
    },
  );
}

export async function bulkPostApplicationInboxAction(input: {
  action: BulkPostApplicationAction;
  provider?: PostApplicationProvider;
  accountKey?: string;
  decidedBy?: string;
}): Promise<BulkPostApplicationActionResponse> {
  return fetchApi<BulkPostApplicationActionResponse>(
    "/post-application/inbox/bulk",
    {
      method: "POST",
      body: JSON.stringify({
        action: input.action,
        provider: input.provider ?? "gmail",
        accountKey: input.accountKey ?? "default",
        ...(input.decidedBy ? { decidedBy: input.decidedBy } : {}),
      }),
    },
  );
}

export async function getPostApplicationRuns(input?: {
  provider?: PostApplicationProvider;
  accountKey?: string;
  limit?: number;
}): Promise<{ runs: PostApplicationSyncRun[]; total: number }> {
  const params = new URLSearchParams();
  params.set("provider", input?.provider ?? "gmail");
  params.set("accountKey", input?.accountKey ?? "default");
  if (typeof input?.limit === "number")
    params.set("limit", String(input.limit));
  const query = params.toString();
  return fetchApi<{ runs: PostApplicationSyncRun[]; total: number }>(
    `/post-application/runs?${query}`,
  );
}

export async function getPostApplicationRunMessages(input: {
  runId: string;
  provider?: PostApplicationProvider;
  accountKey?: string;
  limit?: number;
}): Promise<{
  run: PostApplicationSyncRun;
  items: PostApplicationInboxItem[];
  total: number;
}> {
  const params = new URLSearchParams();
  params.set("provider", input.provider ?? "gmail");
  params.set("accountKey", input.accountKey ?? "default");
  if (typeof input.limit === "number") params.set("limit", String(input.limit));
  const query = params.toString();
  return fetchApi<{
    run: PostApplicationSyncRun;
    items: PostApplicationInboxItem[];
    total: number;
  }>(
    `/post-application/runs/${encodeURIComponent(input.runId)}/messages?${query}`,
  );
}

export async function getDemoInfo(): Promise<DemoInfoResponse> {
  return fetchApi<DemoInfoResponse>("/demo/info");
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

export async function updateSettings(
  update: Partial<UpdateSettingsInput>,
): Promise<AppSettings> {
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

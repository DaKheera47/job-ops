/**
 * Shared types for the job-ops orchestrator.
 */

export type JobStatus =
  | "discovered" // Crawled but not processed
  | "processing" // Currently generating resume
  | "ready" // PDF generated, waiting for user to apply
  | "applied" // Application sent
  | "in_progress" // In process beyond initial application
  | "skipped" // User skipped this job
  | "expired"; // Deadline passed

export const APPLICATION_STAGES = [
  "applied",
  "recruiter_screen",
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
  "closed",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: "Applied",
  recruiter_screen: "Recruiter Screen",
  assessment: "Assessment",
  hiring_manager_screen: "Team Match",
  technical_interview: "Technical Interview",
  onsite: "Final Round",
  offer: "Offer",
  closed: "Closed",
};

export type StageTransitionTarget = ApplicationStage | "no_change";

export const APPLICATION_OUTCOMES = [
  "offer_accepted",
  "offer_declined",
  "rejected",
  "withdrawn",
  "no_response",
  "ghosted",
] as const;

export type JobOutcome = (typeof APPLICATION_OUTCOMES)[number];

export const APPLICATION_TASK_TYPES = [
  "prep",
  "todo",
  "follow_up",
  "check_status",
] as const;

export type ApplicationTaskType = (typeof APPLICATION_TASK_TYPES)[number];

export const INTERVIEW_TYPES = [
  "recruiter_screen",
  "technical",
  "onsite",
  "panel",
  "behavioral",
  "final",
] as const;

export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_OUTCOMES = [
  "pass",
  "fail",
  "pending",
  "cancelled",
] as const;

export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export interface StageEventMetadata {
  note?: string | null;
  actor?: "system" | "user";
  groupId?: string | null;
  groupLabel?: string | null;
  eventLabel?: string | null;
  externalUrl?: string | null;
  reasonCode?: string | null;
  eventType?: "interview_log" | "status_update" | "note" | null;
}

export interface StageEvent {
  id: string;
  applicationId: string;
  title: string;
  groupId: string | null;
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  occurredAt: number;
  metadata: StageEventMetadata | null;
  outcome: JobOutcome | null;
}

export interface ApplicationTask {
  id: string;
  applicationId: string;
  type: ApplicationTaskType;
  title: string;
  dueDate: number | null;
  isCompleted: boolean;
  notes: string | null;
}

export interface Interview {
  id: string;
  applicationId: string;
  scheduledAt: number;
  durationMins: number | null;
  type: InterviewType;
  outcome: InterviewOutcome | null;
}

export type JobSource =
  | "gradcracker"
  | "indeed"
  | "linkedin"
  | "glassdoor"
  | "ukvisajobs"
  | "adzuna"
  | "hiringcafe"
  | "manual";

export interface Job {
  id: string;

  // Source / provenance
  source: JobSource;
  sourceJobId: string | null; // External ID (if provided)
  jobUrlDirect: string | null; // Source-provided direct URL (if provided)
  datePosted: string | null; // Source-provided posting date (if provided)

  // From crawler (normalized)
  title: string;
  employer: string;
  employerUrl: string | null;
  jobUrl: string; // Gradcracker listing URL
  applicationLink: string | null; // Actual application URL
  disciplines: string | null;
  deadline: string | null;
  salary: string | null;
  location: string | null;
  degreeRequired: string | null;
  starting: string | null;
  jobDescription: string | null;

  // Orchestrator enrichments
  status: JobStatus;
  outcome: JobOutcome | null;
  closedAt: number | null;
  suitabilityScore: number | null; // 0-100 AI-generated score
  suitabilityReason: string | null; // AI explanation
  tailoredSummary: string | null; // Generated resume summary
  tailoredHeadline: string | null; // Generated resume headline
  tailoredSkills: string | null; // Generated resume skills (JSON)
  selectedProjectIds: string | null; // Comma-separated IDs of selected projects
  pdfPath: string | null; // Path to generated PDF
  tracerLinksEnabled: boolean; // Rewrite outbound resume links to tracer links on next PDF generation
  sponsorMatchScore: number | null; // 0-100 fuzzy match score with visa sponsors
  sponsorMatchNames: string | null; // JSON array of matched sponsor names (when 100% matches or top match)

  // JobSpy fields (nullable for non-JobSpy sources)
  jobType: string | null;
  salarySource: string | null;
  salaryInterval: string | null;
  salaryMinAmount: number | null;
  salaryMaxAmount: number | null;
  salaryCurrency: string | null;
  isRemote: boolean | null;
  jobLevel: string | null;
  jobFunction: string | null;
  listingType: string | null;
  emails: string | null;
  companyIndustry: string | null;
  companyLogo: string | null;
  companyUrlDirect: string | null;
  companyAddresses: string | null;
  companyNumEmployees: string | null;
  companyRevenue: string | null;
  companyDescription: string | null;
  skills: string | null;
  experienceRange: string | null;
  companyRating: number | null;
  companyReviewsCount: number | null;
  vacancyCount: number | null;
  workFromHomeType: string | null;

  // Timestamps
  discoveredAt: string;
  processedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type JobListItem = Pick<
  Job,
  | "id"
  | "source"
  | "title"
  | "employer"
  | "jobUrl"
  | "applicationLink"
  | "datePosted"
  | "deadline"
  | "salary"
  | "location"
  | "status"
  | "outcome"
  | "closedAt"
  | "suitabilityScore"
  | "sponsorMatchScore"
  | "jobType"
  | "jobFunction"
  | "salaryMinAmount"
  | "salaryMaxAmount"
  | "salaryCurrency"
  | "discoveredAt"
  | "appliedAt"
  | "updatedAt"
>;

export interface CreateJobInput {
  source: JobSource;
  title: string;
  employer: string;
  employerUrl?: string;
  jobUrl: string;
  applicationLink?: string;
  disciplines?: string;
  deadline?: string;
  salary?: string;
  location?: string;
  degreeRequired?: string;
  starting?: string;
  jobDescription?: string;

  // JobSpy fields (optional)
  sourceJobId?: string;
  jobUrlDirect?: string;
  datePosted?: string;
  jobType?: string;
  salarySource?: string;
  salaryInterval?: string;
  salaryMinAmount?: number;
  salaryMaxAmount?: number;
  salaryCurrency?: string;
  isRemote?: boolean;
  jobLevel?: string;
  jobFunction?: string;
  listingType?: string;
  emails?: string;
  companyIndustry?: string;
  companyLogo?: string;
  companyUrlDirect?: string;
  companyAddresses?: string;
  companyNumEmployees?: string;
  companyRevenue?: string;
  companyDescription?: string;
  skills?: string;
  experienceRange?: string;
  companyRating?: number;
  companyReviewsCount?: number;
  vacancyCount?: number;
  workFromHomeType?: string;
}

export interface ManualJobDraft {
  title?: string;
  employer?: string;
  jobUrl?: string;
  applicationLink?: string;
  location?: string;
  salary?: string;
  deadline?: string;
  jobDescription?: string;
  jobType?: string;
  jobLevel?: string;
  jobFunction?: string;
  disciplines?: string;
  degreeRequired?: string;
  starting?: string;
}

export interface ManualJobInferenceResponse {
  job: ManualJobDraft;
  warning?: string | null;
}

export interface ManualJobFetchResponse {
  content: string;
  url: string;
}

export interface UpdateJobInput {
  title?: string;
  employer?: string;
  jobUrl?: string;
  applicationLink?: string | null;
  location?: string | null;
  salary?: string | null;
  deadline?: string | null;
  status?: JobStatus;
  outcome?: JobOutcome | null;
  closedAt?: number | null;
  jobDescription?: string | null;
  suitabilityScore?: number;
  suitabilityReason?: string;
  tailoredSummary?: string;
  tailoredHeadline?: string;
  tailoredSkills?: string;
  selectedProjectIds?: string;
  pdfPath?: string;
  tracerLinksEnabled?: boolean;
  appliedAt?: string;
  sponsorMatchScore?: number;
  sponsorMatchNames?: string;
}

export interface PipelineConfig {
  topN: number; // Number of top jobs to process
  minSuitabilityScore: number; // Minimum score to auto-process
  sources: JobSource[]; // Job sources to crawl
  outputDir: string; // Directory for generated PDFs
  enableCrawling?: boolean;
  enableScoring?: boolean;
  enableImporting?: boolean;
  enableAutoTailoring?: boolean;
}

export interface PipelineRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  jobsDiscovered: number;
  jobsProcessed: number;
  errorMessage: string | null;
}

// API Response types
export interface ApiMeta {
  requestId: string;
  simulated?: boolean;
  blockedReason?: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> =
  | {
      ok: true;
      data: T;
      meta?: ApiMeta;
    }
  | {
      ok: false;
      error: ApiErrorPayload;
      meta: ApiMeta;
    };

export interface TracerAnalyticsTimeseriesPoint {
  day: string; // YYYY-MM-DD
  clicks: number;
  uniqueOpens: number;
  botClicks: number;
  humanClicks: number;
}

export interface TracerAnalyticsTopJob {
  jobId: string;
  title: string;
  employer: string;
  clicks: number;
  uniqueOpens: number;
  botClicks: number;
  humanClicks: number;
  lastClickedAt: number | null;
}

export interface TracerAnalyticsTopLink {
  tracerLinkId: string;
  token: string;
  jobId: string;
  title: string;
  employer: string;
  sourcePath: string;
  sourceLabel: string;
  destinationUrl: string;
  clicks: number;
  uniqueOpens: number;
  botClicks: number;
  humanClicks: number;
  lastClickedAt: number | null;
}

export interface TracerAnalyticsResponse {
  filters: {
    jobId: string | null;
    from: number | null;
    to: number | null;
    includeBots: boolean;
    limit: number;
  };
  totals: {
    clicks: number;
    uniqueOpens: number;
    botClicks: number;
    humanClicks: number;
  };
  timeSeries: TracerAnalyticsTimeseriesPoint[];
  topJobs: TracerAnalyticsTopJob[];
  topLinks: TracerAnalyticsTopLink[];
}

export interface JobTracerLinkAnalyticsItem {
  tracerLinkId: string;
  token: string;
  sourcePath: string;
  sourceLabel: string;
  destinationUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  clicks: number;
  uniqueOpens: number;
  botClicks: number;
  humanClicks: number;
  lastClickedAt: number | null;
}

export interface JobTracerLinksResponse {
  job: {
    id: string;
    title: string;
    employer: string;
    tracerLinksEnabled: boolean;
  };
  totals: {
    links: number;
    clicks: number;
    uniqueOpens: number;
    botClicks: number;
    humanClicks: number;
  };
  links: JobTracerLinkAnalyticsItem[];
}

export type TracerReadinessStatus = "ready" | "unconfigured" | "unavailable";

export interface TracerReadinessResponse {
  status: TracerReadinessStatus;
  canEnable: boolean;
  publicBaseUrl: string | null;
  healthUrl: string | null;
  checkedAt: number;
  lastSuccessAt: number | null;
  reason: string | null;
}

export const POST_APPLICATION_PROVIDERS = ["gmail", "imap"] as const;
export type PostApplicationProvider =
  (typeof POST_APPLICATION_PROVIDERS)[number];

export const POST_APPLICATION_PROVIDER_ACTIONS = [
  "connect",
  "status",
  "sync",
  "disconnect",
] as const;
export type PostApplicationProviderAction =
  (typeof POST_APPLICATION_PROVIDER_ACTIONS)[number];

export const POST_APPLICATION_INTEGRATION_STATUSES = [
  "disconnected",
  "connected",
  "error",
] as const;
export type PostApplicationIntegrationStatus =
  (typeof POST_APPLICATION_INTEGRATION_STATUSES)[number];

export const POST_APPLICATION_SYNC_RUN_STATUSES = [
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type PostApplicationSyncRunStatus =
  (typeof POST_APPLICATION_SYNC_RUN_STATUSES)[number];

export const POST_APPLICATION_RELEVANCE_DECISIONS = [
  "relevant",
  "not_relevant",
  "needs_llm",
] as const;
export type PostApplicationRelevanceDecision =
  (typeof POST_APPLICATION_RELEVANCE_DECISIONS)[number];

export const POST_APPLICATION_MESSAGE_TYPES = [
  "interview",
  "rejection",
  "offer",
  "update",
  "other",
] as const;
export type PostApplicationMessageType =
  (typeof POST_APPLICATION_MESSAGE_TYPES)[number];

export const POST_APPLICATION_ROUTER_STAGE_TARGETS = [
  "no_change",
  "applied",
  "recruiter_screen",
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
  "rejected",
  "withdrawn",
  "closed",
] as const;
export type PostApplicationRouterStageTarget =
  (typeof POST_APPLICATION_ROUTER_STAGE_TARGETS)[number];

export const POST_APPLICATION_PROCESSING_STATUSES = [
  "auto_linked",
  "pending_user",
  "manual_linked",
  "ignored",
] as const;
export type PostApplicationProcessingStatus =
  (typeof POST_APPLICATION_PROCESSING_STATUSES)[number];

export interface PostApplicationIntegration {
  id: string;
  provider: PostApplicationProvider;
  accountKey: string;
  displayName: string | null;
  status: PostApplicationIntegrationStatus;
  credentials: Record<string, unknown> | null;
  lastConnectedAt: number | null;
  lastSyncedAt: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostApplicationSyncRun {
  id: string;
  provider: PostApplicationProvider;
  accountKey: string;
  integrationId: string | null;
  status: PostApplicationSyncRunStatus;
  startedAt: number;
  completedAt: number | null;
  messagesDiscovered: number;
  messagesRelevant: number;
  messagesClassified: number;
  messagesMatched: number;
  messagesApproved: number;
  messagesDenied: number;
  messagesErrored: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostApplicationMessage {
  id: string;
  provider: PostApplicationProvider;
  accountKey: string;
  integrationId: string | null;
  syncRunId: string | null;
  externalMessageId: string;
  externalThreadId: string | null;
  fromAddress: string;
  fromDomain: string | null;
  senderName: string | null;
  subject: string;
  receivedAt: number;
  snippet: string;
  classificationLabel: string | null;
  classificationConfidence: number | null;
  classificationPayload: Record<string, unknown> | null;
  relevanceLlmScore: number | null;
  relevanceDecision: PostApplicationRelevanceDecision;
  matchedJobId: string | null;
  matchConfidence: number | null;
  stageTarget: PostApplicationRouterStageTarget | null;
  messageType: PostApplicationMessageType;
  stageEventPayload: Record<string, unknown> | null;
  processingStatus: PostApplicationProcessingStatus;
  decidedAt: number | null;
  decidedBy: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostApplicationProviderActionConnectRequest {
  accountKey?: string;
  payload?: Record<string, unknown>;
}

export interface PostApplicationProviderActionSyncRequest {
  accountKey?: string;
  maxMessages?: number;
  searchDays?: number;
}

export interface PostApplicationProviderStatus {
  provider: PostApplicationProvider;
  accountKey: string;
  connected: boolean;
  integration: PostApplicationIntegration | null;
}

export interface PostApplicationProviderActionResponse {
  provider: PostApplicationProvider;
  action: PostApplicationProviderAction;
  accountKey: string;
  status: PostApplicationProviderStatus;
  message?: string;
}

export interface PostApplicationInboxItem {
  message: PostApplicationMessage;
  matchedJob?: {
    id: string;
    title: string;
    employer: string;
  } | null;
}

export type PostApplicationAction = "approve" | "deny";

export interface PostApplicationActionRequest {
  action: PostApplicationAction;
  provider: PostApplicationProvider;
  accountKey: string;
}

export type PostApplicationActionResult =
  | {
      messageId: string;
      ok: true;
      message: PostApplicationMessage;
      stageEventId?: string | null;
    }
  | {
      messageId: string;
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export interface PostApplicationActionResponse {
  action: PostApplicationAction;
  requested: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: PostApplicationActionResult[];
}

export interface JobsListResponse<TJob = Job> {
  jobs: TJob[];
  total: number;
  byStatus: Record<JobStatus, number>;
  revision: string;
}

export interface JobsRevisionResponse {
  revision: string;
  latestUpdatedAt: string | null;
  total: number;
  statusFilter: string | null;
}

export type JobAction = "skip" | "move_to_ready" | "rescore";

export type JobActionRequest =
  | {
      action: "skip" | "rescore";
      jobIds: string[];
    }
  | {
      action: "move_to_ready";
      jobIds: string[];
      options?: {
        force?: boolean;
      };
    };

export type JobActionResult =
  | {
      jobId: string;
      ok: true;
      job: Job;
    }
  | {
      jobId: string;
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export interface JobActionResponse {
  action: JobAction;
  requested: number;
  succeeded: number;
  failed: number;
  results: JobActionResult[];
}

export type JobActionStreamEvent =
  | {
      type: "started";
      action: JobAction;
      requested: number;
      completed: number;
      succeeded: number;
      failed: number;
      requestId: string;
    }
  | {
      type: "progress";
      action: JobAction;
      requested: number;
      completed: number;
      succeeded: number;
      failed: number;
      result: JobActionResult;
      requestId: string;
    }
  | {
      type: "completed";
      action: JobAction;
      requested: number;
      completed: number;
      succeeded: number;
      failed: number;
      results: JobActionResult[];
      requestId: string;
    }
  | {
      type: "error";
      code: string;
      message: string;
      requestId: string;
    };

export const JOB_CHAT_MESSAGE_ROLES = [
  "system",
  "user",
  "assistant",
  "tool",
] as const;
export type JobChatMessageRole = (typeof JOB_CHAT_MESSAGE_ROLES)[number];

export const JOB_CHAT_MESSAGE_STATUSES = [
  "complete",
  "partial",
  "cancelled",
  "failed",
] as const;
export type JobChatMessageStatus = (typeof JOB_CHAT_MESSAGE_STATUSES)[number];

export const JOB_CHAT_RUN_STATUSES = [
  "running",
  "completed",
  "cancelled",
  "failed",
] as const;
export type JobChatRunStatus = (typeof JOB_CHAT_RUN_STATUSES)[number];

export interface JobChatThread {
  id: string;
  jobId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface JobChatMessage {
  id: string;
  threadId: string;
  jobId: string;
  role: JobChatMessageRole;
  content: string;
  status: JobChatMessageStatus;
  tokensIn: number | null;
  tokensOut: number | null;
  version: number;
  replacesMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobChatRun {
  id: string;
  threadId: string;
  jobId: string;
  status: JobChatRunStatus;
  model: string | null;
  provider: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: number;
  completedAt: number | null;
  requestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type JobChatStreamEvent =
  | {
      type: "ready";
      runId: string;
      threadId: string;
      messageId: string;
      requestId: string;
    }
  | {
      type: "delta";
      runId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: "completed";
      runId: string;
      message: JobChatMessage;
    }
  | {
      type: "cancelled";
      runId: string;
      message: JobChatMessage;
    }
  | {
      type: "error";
      runId: string;
      code: string;
      message: string;
      requestId: string;
    };

// Visa Sponsors types
export interface VisaSponsor {
  organisationName: string;
  townCity: string;
  county: string;
  typeRating: string;
  route: string;
}

export interface VisaSponsorSearchResult {
  sponsor: VisaSponsor;
  score: number;
  matchedName: string;
}

export interface VisaSponsorSearchResponse {
  results: VisaSponsorSearchResult[];
  query: string;
  total: number;
}

export interface VisaSponsorStatusResponse {
  lastUpdated: string | null;
  csvPath: string | null;
  totalSponsors: number;
  isUpdating: boolean;
  nextScheduledUpdate: string | null;
  error: string | null;
}

export interface PipelineStatusResponse {
  isRunning: boolean;
  lastRun: PipelineRun | null;
  nextScheduledRun: string | null;
}

export interface ResumeProjectCatalogItem {
  id: string;
  name: string;
  description: string;
  date: string;
  isVisibleInBase: boolean;
}

export interface ResumeProjectsSettings {
  maxProjects: number;
  lockedProjectIds: string[];
  aiSelectableProjectIds: string[];
}

export interface ResumeProfile {
  basics?: {
    name?: string;
    label?: string;
    image?: string;
    email?: string;
    phone?: string;
    url?: string;
    summary?: string;
    headline?: string;
    location?: {
      address?: string;
      postalCode?: string;
      city?: string;
      countryCode?: string;
      region?: string;
    };
    profiles?: Array<{
      network?: string;
      username?: string;
      url?: string;
    }>;
  };
  sections?: {
    summary?: {
      id?: string;
      visible?: boolean;
      name?: string;
      content?: string;
    };
    skills?: {
      id?: string;
      visible?: boolean;
      name?: string;
      items?: Array<{
        id: string;
        name: string;
        description: string;
        level: number;
        keywords: string[];
        visible: boolean;
      }>;
    };
    projects?: {
      id?: string;
      visible?: boolean;
      name?: string;
      items?: Array<{
        id: string;
        name: string;
        description: string;
        date: string;
        summary: string;
        visible: boolean;
        keywords?: string[];
        url?: string;
      }>;
    };
    experience?: {
      id?: string;
      visible?: boolean;
      name?: string;
      items?: Array<{
        id: string;
        company: string;
        position: string;
        location: string;
        date: string;
        summary: string;
        visible: boolean;
      }>;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ProfileStatusResponse {
  exists: boolean;
  error: string | null;
}

export interface ValidationResult {
  valid: boolean;
  message: string | null;
}

export interface DemoInfoResponse {
  demoMode: boolean;
  resetCadenceHours: number;
  lastResetAt: string | null;
  nextResetAt: string | null;
  baselineVersion: string | null;
  baselineName: string | null;
}

export interface AppSettings {
  model: string;
  defaultModel: string;
  overrideModel: string | null;
  // Specific model overrides
  modelScorer: string; // resolved
  overrideModelScorer: string | null;
  modelTailoring: string; // resolved
  overrideModelTailoring: string | null;
  modelProjectSelection: string; // resolved
  overrideModelProjectSelection: string | null;

  llmProvider: string;
  defaultLlmProvider: string;
  overrideLlmProvider: string | null;
  llmBaseUrl: string;
  defaultLlmBaseUrl: string;
  overrideLlmBaseUrl: string | null;

  pipelineWebhookUrl: string;
  defaultPipelineWebhookUrl: string;
  overridePipelineWebhookUrl: string | null;
  jobCompleteWebhookUrl: string;
  defaultJobCompleteWebhookUrl: string;
  overrideJobCompleteWebhookUrl: string | null;
  profileProjects: ResumeProjectCatalogItem[];
  resumeProjects: ResumeProjectsSettings;
  defaultResumeProjects: ResumeProjectsSettings;
  overrideResumeProjects: ResumeProjectsSettings | null;
  rxresumeBaseResumeId: string | null;
  ukvisajobsMaxJobs: number;
  defaultUkvisajobsMaxJobs: number;
  overrideUkvisajobsMaxJobs: number | null;
  adzunaMaxJobsPerTerm: number;
  defaultAdzunaMaxJobsPerTerm: number;
  overrideAdzunaMaxJobsPerTerm: number | null;
  gradcrackerMaxJobsPerTerm: number;
  defaultGradcrackerMaxJobsPerTerm: number;
  overrideGradcrackerMaxJobsPerTerm: number | null;
  searchTerms: string[];
  defaultSearchTerms: string[];
  overrideSearchTerms: string[] | null;
  searchCities: string;
  defaultSearchCities: string;
  overrideSearchCities: string | null;
  jobspyResultsWanted: number;
  defaultJobspyResultsWanted: number;
  overrideJobspyResultsWanted: number | null;
  jobspyCountryIndeed: string;
  defaultJobspyCountryIndeed: string;
  overrideJobspyCountryIndeed: string | null;
  showSponsorInfo: boolean;
  defaultShowSponsorInfo: boolean;
  overrideShowSponsorInfo: boolean | null;
  chatStyleTone: string;
  defaultChatStyleTone: string;
  overrideChatStyleTone: string | null;
  chatStyleFormality: string;
  defaultChatStyleFormality: string;
  overrideChatStyleFormality: string | null;
  chatStyleConstraints: string;
  defaultChatStyleConstraints: string;
  overrideChatStyleConstraints: string | null;
  chatStyleDoNotUse: string;
  defaultChatStyleDoNotUse: string;
  overrideChatStyleDoNotUse: string | null;
  llmApiKeyHint: string | null;
  rxresumeEmail: string | null;
  rxresumePasswordHint: string | null;
  basicAuthUser: string | null;
  basicAuthPasswordHint: string | null;
  ukvisajobsEmail: string | null;
  ukvisajobsPasswordHint: string | null;
  adzunaAppId: string | null;
  adzunaAppKeyHint: string | null;
  webhookSecretHint: string | null;
  basicAuthActive: boolean;
  // Backup settings
  backupEnabled: boolean;
  defaultBackupEnabled: boolean;
  overrideBackupEnabled: boolean | null;
  backupHour: number;
  defaultBackupHour: number;
  overrideBackupHour: number | null;
  backupMaxCount: number;
  defaultBackupMaxCount: number;
  overrideBackupMaxCount: number | null;
  // Scoring settings
  penalizeMissingSalary: boolean;
  defaultPenalizeMissingSalary: boolean;
  overridePenalizeMissingSalary: boolean | null;
  missingSalaryPenalty: number;
  defaultMissingSalaryPenalty: number;
  overrideMissingSalaryPenalty: number | null;
  // Auto-skip settings
  autoSkipScoreThreshold: number | null;
  defaultAutoSkipScoreThreshold: number | null;
  overrideAutoSkipScoreThreshold: number | null;
}

export interface BackupInfo {
  filename: string;
  type: "auto" | "manual";
  size: number;
  createdAt: string;
}

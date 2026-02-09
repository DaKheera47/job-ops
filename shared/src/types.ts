/**
 * Shared types for the job-ops orchestrator.
 */

export type JobStatus =
  | "discovered" // Crawled but not processed
  | "processing" // Currently generating resume
  | "ready" // PDF generated, waiting for user to apply
  | "applied" // User marked as applied (added to Notion)
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
  hiring_manager_screen: "Hiring Manager Screen",
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
  | "ukvisajobs"
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
  notionPageId: string | null; // Notion page ID if synced
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
  notionPageId?: string;
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

export type BulkJobAction = "skip" | "move_to_ready" | "rescore";

export interface BulkJobActionRequest {
  action: BulkJobAction;
  jobIds: string[];
}

export type BulkJobActionResult =
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

export interface BulkJobActionResponse {
  action: BulkJobAction;
  requested: number;
  succeeded: number;
  failed: number;
  results: BulkJobActionResult[];
}

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
  gradcrackerMaxJobsPerTerm: number;
  defaultGradcrackerMaxJobsPerTerm: number;
  overrideGradcrackerMaxJobsPerTerm: number | null;
  searchTerms: string[];
  defaultSearchTerms: string[];
  overrideSearchTerms: string[] | null;
  jobspyLocation: string;
  defaultJobspyLocation: string;
  overrideJobspyLocation: string | null;
  jobspyResultsWanted: number;
  defaultJobspyResultsWanted: number;
  overrideJobspyResultsWanted: number | null;
  jobspyHoursOld: number;
  defaultJobspyHoursOld: number;
  overrideJobspyHoursOld: number | null;
  jobspyCountryIndeed: string;
  defaultJobspyCountryIndeed: string;
  overrideJobspyCountryIndeed: string | null;
  jobspySites: string[];
  defaultJobspySites: string[];
  overrideJobspySites: string[] | null;
  jobspyLinkedinFetchDescription: boolean;
  defaultJobspyLinkedinFetchDescription: boolean;
  overrideJobspyLinkedinFetchDescription: boolean | null;
  jobspyIsRemote: boolean;
  defaultJobspyIsRemote: boolean;
  overrideJobspyIsRemote: boolean | null;
  showSponsorInfo: boolean;
  defaultShowSponsorInfo: boolean;
  overrideShowSponsorInfo: boolean | null;
  llmApiKeyHint: string | null;
  /** @deprecated Use llmApiKeyHint instead. */
  openrouterApiKeyHint: string | null;
  rxresumeEmail: string | null;
  rxresumePasswordHint: string | null;
  basicAuthUser: string | null;
  basicAuthPasswordHint: string | null;
  ukvisajobsEmail: string | null;
  ukvisajobsPasswordHint: string | null;
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

/**
 * Shared types for the job-ops orchestrator.
 */

export type JobStatus =
  | 'discovered'      // Crawled but not processed
  | 'processing'      // Currently generating resume
  | 'ready'           // PDF generated, waiting for user to apply
  | 'applied'         // User marked as applied (added to Notion)
  | 'rejected'        // User rejected this job
  | 'expired';        // Deadline passed

export type JobSource =
  | 'gradcracker'
  | 'indeed'
  | 'linkedin'
  | 'ukvisajobs';

export interface Job {
  id: string;

  // Source / provenance
  source: JobSource;
  sourceJobId: string | null;        // External ID (if provided)
  jobUrlDirect: string | null;       // Source-provided direct URL (if provided)
  datePosted: string | null;         // Source-provided posting date (if provided)

  // From crawler (normalized)
  title: string;
  employer: string;
  employerUrl: string | null;
  jobUrl: string;           // Gradcracker listing URL
  applicationLink: string | null;  // Actual application URL
  disciplines: string | null;
  deadline: string | null;
  salary: string | null;
  location: string | null;
  degreeRequired: string | null;
  starting: string | null;
  jobDescription: string | null;

  // Orchestrator enrichments
  status: JobStatus;
  suitabilityScore: number | null;   // 0-100 AI-generated score
  suitabilityReason: string | null;  // AI explanation
  tailoredSummary: string | null;    // Generated resume summary
  pdfPath: string | null;            // Path to generated PDF
  notionPageId: string | null;       // Notion page ID if synced

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

export interface UpdateJobInput {
  status?: JobStatus;
  suitabilityScore?: number;
  suitabilityReason?: string;
  tailoredSummary?: string;
  pdfPath?: string;
  notionPageId?: string;
  appliedAt?: string;
}

export interface PipelineConfig {
  topN: number;                      // Number of top jobs to process
  minSuitabilityScore: number;       // Minimum score to auto-process
  sources: JobSource[];              // Job sources to crawl
  profilePath: string;               // Path to profile JSON
  outputDir: string;                 // Directory for generated PDFs
}

export interface PipelineRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'failed';
  jobsDiscovered: number;
  jobsProcessed: number;
  errorMessage: string | null;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface JobsListResponse {
  jobs: Job[];
  total: number;
  byStatus: Record<JobStatus, number>;
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

export interface AppSettings {
  model: string;
  defaultModel: string;
  overrideModel: string | null;
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
  ukvisajobsMaxJobs: number;
  defaultUkvisajobsMaxJobs: number;
  overrideUkvisajobsMaxJobs: number | null;
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
  jobspyLinkedinFetchDescription: boolean;
  defaultJobspyLinkedinFetchDescription: boolean;
  overrideJobspyLinkedinFetchDescription: boolean | null;
}

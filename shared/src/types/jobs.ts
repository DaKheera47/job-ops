import type { ExtractorSourceId } from "../extractors";

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

export type JobSource = ExtractorSourceId;

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

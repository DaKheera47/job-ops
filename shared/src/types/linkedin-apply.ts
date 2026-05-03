export type LinkedInApplyStep =
  | "idle"
  | "opening_browser"
  | "navigating"
  | "detecting_easy_apply"
  | "filling_form"
  | "uploading_resume"
  | "waiting_for_review"
  | "submitting"
  | "verifying"
  | "completed"
  | "failed"
  | "manual_required";

export interface LinkedInApplyProgress {
  step: LinkedInApplyStep;
  message: string;
  detail?: string;
  jobId: string;
  viewerUrl?: string;
  error?: string;
  needsHumanInput?: boolean;
}

export interface LinkedInSessionStatus {
  authenticated: boolean;
  lastVerifiedAt: string | null;
  profileName?: string;
}

export type BatchJobResultStatus =
  | "pending"
  | "applying"
  | "applied"
  | "failed"
  | "manual_required"
  | "skipped";

export interface BatchJobResult {
  jobId: string;
  jobTitle: string;
  employer: string;
  status: BatchJobResultStatus;
  error?: string;
}

export interface LinkedInBatchApplyProgress {
  running: boolean;
  currentIndex: number;
  totalJobs: number;
  results: BatchJobResult[];
  viewerUrl?: string;
}

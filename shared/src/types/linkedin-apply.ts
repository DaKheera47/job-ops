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

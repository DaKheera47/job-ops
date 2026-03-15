export const PLATFORM_SCORING_STATUS_VALUES = [
  "ai_verified",
  "degraded_fallback",
] as const;

export type PlatformScoringStatus =
  (typeof PLATFORM_SCORING_STATUS_VALUES)[number];

export const RESUME_OWNERSHIP_MODE_VALUES = [
  "canonical_human_owned",
  "platform_managed",
  "snapshot_read_only",
] as const;

export type ResumeOwnershipMode = (typeof RESUME_OWNERSHIP_MODE_VALUES)[number];

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug?: string | null;
}

export interface WorkspaceProfileSummary {
  id: string;
  workspaceId: string;
  label: string;
  isDefault: boolean;
  lane?: string | null;
}

export interface CanonicalResumeRef {
  profileId: string;
  resumeId: string;
  source: "rxresume";
}

export interface DerivedResumeVariantSummary {
  id: string;
  workspaceId: string;
  profileId: string;
  jobId: string;
  sourceResumeId: string;
  status: "pending" | "ready" | "failed";
  pdfPath: string | null;
}

export interface ResumeSnapshotSummary {
  id: string;
  workspaceId: string;
  profileId: string;
  sourceResumeId: string;
  checksum: string;
  format: string;
  createdAt: string;
}

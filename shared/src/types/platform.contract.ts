import type {
  GetResumeStudioBootstrapResponse,
  GetScoringHealthResponse,
  GetWorkspaceProfilesResponse,
} from "./api";
import type {
  CanonicalResumeRef,
  DerivedResumeVariantSummary,
  PlatformScoringStatus,
  ResumeOwnershipMode,
  ResumeSnapshotSummary,
  WorkspaceProfileSummary,
  WorkspaceSummary,
} from "./platform";

const workspace = {
  id: "workspace_1",
  name: "Gipfeli",
  slug: "gipfeli",
} satisfies WorkspaceSummary;

const verifiedStatus: PlatformScoringStatus = "ai_verified";
const degradedStatus: PlatformScoringStatus = "degraded_fallback";

const profile: WorkspaceProfileSummary = {
  id: "profile_1",
  workspaceId: workspace.id,
  label: "Gastro",
  isDefault: true,
  lane: "operations",
};

const canonical: CanonicalResumeRef = {
  profileId: profile.id,
  resumeId: "resume_1",
  source: "rxresume",
};

const variant = {
  id: "variant_1",
  workspaceId: workspace.id,
  profileId: profile.id,
  jobId: "job_1",
  sourceResumeId: canonical.resumeId,
  status: "ready",
  pdfPath: "/tmp/resume.pdf",
} satisfies DerivedResumeVariantSummary;

const snapshot = {
  id: "snapshot_1",
  workspaceId: workspace.id,
  profileId: profile.id,
  sourceResumeId: canonical.resumeId,
  checksum: "sha256:abc123",
  format: "json",
  createdAt: "2026-03-14T12:00:00.000Z",
} satisfies ResumeSnapshotSummary;

const humanOwned: ResumeOwnershipMode = "canonical_human_owned";
const platformManaged: ResumeOwnershipMode = "platform_managed";
const snapshotOwned: ResumeOwnershipMode = "snapshot_read_only";

const workspaceProfilesResponse = {
  workspace,
  profiles: [profile],
} satisfies GetWorkspaceProfilesResponse;

const resumeStudioBootstrapResponse = {
  workspace,
  profiles: [profile],
  activeProfile: null,
  canonicalResume: canonical,
  latestSnapshot: snapshot,
  ownership: humanOwned,
} satisfies GetResumeStudioBootstrapResponse;

const scoringHealthResponse = {
  status: degradedStatus,
  provider: "fallback-keyword",
  degradedReason: "llm_unavailable",
} satisfies GetScoringHealthResponse;

void verifiedStatus;
void degradedStatus;
void variant;
void workspaceProfilesResponse;
void resumeStudioBootstrapResponse;
void scoringHealthResponse;
void platformManaged;
void snapshotOwned;
void canonical;

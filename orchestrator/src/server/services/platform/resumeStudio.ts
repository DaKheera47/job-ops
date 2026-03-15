import { createHash } from "node:crypto";
import { db, schema } from "@server/db";
import {
  listProfilesByWorkspace,
  setCanonicalResume,
} from "@server/repositories/profiles";
import { createSnapshot } from "@server/repositories/resumeSnapshots";
import { getResume as getRxResume } from "@server/services/rxresume";
import type {
  GetResumeStudioBootstrapResponse,
  ResumeSnapshotSummary,
  WorkspaceProfileSummary,
  WorkspaceSummary,
} from "@shared/types";
import { desc, eq } from "drizzle-orm";
import { resolvePlatformProfile } from "./profiles";

const { resumeSnapshots, workspaces } = schema;
type CanonicalResumeSelectionArgs = {
  profileId?: string | null;
  workspaceId?: string | null;
  bootstrapFromLegacy?: boolean;
};
type ResolvedPlatformProfile = Awaited<
  ReturnType<typeof resolvePlatformProfile>
>;
type CanonicalResumeSelection = Omit<
  ResolvedPlatformProfile,
  "canonicalResume"
> & {
  canonicalResume: NonNullable<ResolvedPlatformProfile["canonicalResume"]>;
};

function toWorkspaceSummary(
  workspace: typeof workspaces.$inferSelect,
): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug ?? null,
  };
}

function toWorkspaceProfileSummary(
  profile: Awaited<ReturnType<typeof listProfilesByWorkspace>>[number],
): WorkspaceProfileSummary {
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    label: profile.label,
    isDefault: profile.isDefault,
    lane: profile.lane ?? null,
  };
}

function toResumeSnapshotSummary(
  snapshot: typeof resumeSnapshots.$inferSelect,
): ResumeSnapshotSummary {
  return {
    id: snapshot.id,
    workspaceId: snapshot.workspaceId,
    profileId: snapshot.profileId,
    sourceResumeId: snapshot.sourceResumeId,
    checksum: snapshot.checksum,
    format: snapshot.format,
    createdAt: snapshot.createdAt,
  };
}

async function getLatestSnapshot(profileId: string) {
  const [snapshot] = await db
    .select()
    .from(resumeSnapshots)
    .where(eq(resumeSnapshots.profileId, profileId))
    .orderBy(desc(resumeSnapshots.createdAt), desc(resumeSnapshots.id))
    .limit(1);

  return snapshot ?? null;
}

export async function getResumeStudioBootstrap(
  workspaceId: string,
  profileId?: string | null,
): Promise<GetResumeStudioBootstrapResponse> {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new Error(`Workspace '${workspaceId}' not found`);
  }

  const workspaceProfiles = await listProfilesByWorkspace(workspaceId);
  if (
    profileId &&
    !workspaceProfiles.some((profile) => profile.id === profileId)
  ) {
    throw new Error(
      `Profile '${profileId}' does not belong to workspace '${workspaceId}'`,
    );
  }
  const activeProfileRow =
    workspaceProfiles.find((profile) => profile.id === profileId) ??
    workspaceProfiles.find((profile) => profile.isDefault) ??
    workspaceProfiles[0] ??
    null;

  const { canonicalResume } = activeProfileRow
    ? await resolvePlatformProfile({
        workspaceId,
        profileId: activeProfileRow.id,
        bootstrapFromLegacy: false,
      })
    : { canonicalResume: null };
  const latestSnapshot = activeProfileRow
    ? await getLatestSnapshot(activeProfileRow.id)
    : null;

  return {
    workspace: toWorkspaceSummary(workspace),
    profiles: workspaceProfiles.map(toWorkspaceProfileSummary),
    activeProfile: activeProfileRow
      ? toWorkspaceProfileSummary(activeProfileRow)
      : null,
    canonicalResume: canonicalResume
      ? {
          profileId: canonicalResume.profileId,
          resumeId: canonicalResume.rxresumeResumeId,
          source: canonicalResume.source,
        }
      : null,
    latestSnapshot: latestSnapshot
      ? toResumeSnapshotSummary(latestSnapshot)
      : null,
    ownership: "canonical_human_owned",
  };
}

export async function assignCanonicalResume(
  profileId: string,
  rxResumeId: string,
) {
  const { workspace, profile } = await resolvePlatformProfile({
    profileId,
    bootstrapFromLegacy: false,
  });

  return setCanonicalResume({
    workspaceId: workspace.id,
    profileId: profile.id,
    rxresumeResumeId: rxResumeId,
  });
}

export async function getCanonicalResumeAccess(args?: {
  profileId?: string | null;
  workspaceId?: string | null;
  bootstrapFromLegacy?: boolean;
}) {
  const selection = await getCanonicalResumeSelection(args);
  const resume = await getRxResume(selection.canonicalResume.rxresumeResumeId);
  if (!resume.data || typeof resume.data !== "object") {
    throw new Error("Canonical resume data is empty or invalid");
  }

  return {
    ...selection,
    resume,
  };
}

export async function getCanonicalResumeSelection(
  args?: CanonicalResumeSelectionArgs,
): Promise<CanonicalResumeSelection> {
  const { workspace, profile, canonicalResume } = await resolvePlatformProfile({
    profileId: args?.profileId,
    workspaceId: args?.workspaceId,
    bootstrapFromLegacy: args?.bootstrapFromLegacy,
  });

  if (!canonicalResume) {
    throw new Error(
      `Canonical resume is not configured for profile '${profile.id}'`,
    );
  }

  return {
    workspace,
    profile,
    canonicalResume,
  };
}

export async function createResumeSnapshotFromCanonical(profileId: string) {
  const { workspace, profile, canonicalResume, resume } =
    await getCanonicalResumeAccess({
      profileId,
      bootstrapFromLegacy: false,
    });

  const payload = JSON.stringify(resume.data);
  const checksum = `sha256:${createHash("sha256").update(payload).digest("hex")}`;

  return createSnapshot({
    workspaceId: workspace.id,
    profileId: profile.id,
    sourceResumeId: canonicalResume.rxresumeResumeId,
    format: "json",
    checksum,
    payload,
  });
}

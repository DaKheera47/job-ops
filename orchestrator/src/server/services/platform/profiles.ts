import { randomUUID } from "node:crypto";
import { db, schema } from "@server/db";
import { setCanonicalResume } from "@server/repositories/profiles";
import { createWorkspace } from "@server/repositories/workspaces";
import { getConfiguredRxResumeBaseResumeId } from "@server/services/rxresume/baseResumeId";
import { and, asc, eq } from "drizzle-orm";

const { canonicalResumes, profiles, workspaces } = schema;

async function getWorkspaceById(workspaceId: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new Error(`Workspace '${workspaceId}' not found`);
  }

  return workspace;
}

async function getProfileById(profileId: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    throw new Error(`Profile '${profileId}' not found`);
  }

  return profile;
}

async function getFirstWorkspace() {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .orderBy(asc(workspaces.createdAt), asc(workspaces.id))
    .limit(1);

  return workspace ?? null;
}

async function getDefaultProfileForWorkspace(workspaceId: string) {
  const [defaultProfile] = await db
    .select()
    .from(profiles)
    .where(
      and(eq(profiles.workspaceId, workspaceId), eq(profiles.isDefault, true)),
    )
    .limit(1);

  if (defaultProfile) return defaultProfile;

  const [firstProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId))
    .orderBy(asc(profiles.createdAt), asc(profiles.id))
    .limit(1);

  return firstProfile ?? null;
}

async function createBootstrapProfile(workspaceId: string) {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(profiles).values({
    id,
    workspaceId,
    label: "Primary",
    isDefault: true,
    lane: null,
    createdAt: now,
    updatedAt: now,
  });

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);

  if (!profile) {
    throw new Error(`Failed to create bootstrap profile for '${workspaceId}'`);
  }

  return profile;
}

async function getCanonicalResumeByProfileId(profileId: string) {
  const [canonicalResume] = await db
    .select()
    .from(canonicalResumes)
    .where(eq(canonicalResumes.profileId, profileId))
    .limit(1);

  return canonicalResume ?? null;
}

export async function resolvePlatformProfile(args?: {
  workspaceId?: string | null;
  profileId?: string | null;
  bootstrapFromLegacy?: boolean;
}): Promise<{
  workspace: typeof workspaces.$inferSelect;
  profile: typeof profiles.$inferSelect;
  canonicalResume: typeof canonicalResumes.$inferSelect | null;
}> {
  const bootstrapFromLegacy = Boolean(args?.bootstrapFromLegacy);
  let workspace: typeof workspaces.$inferSelect | null = null;
  let profile: typeof profiles.$inferSelect | null = null;

  if (args?.profileId) {
    profile = await getProfileById(args.profileId);
    workspace = await getWorkspaceById(profile.workspaceId);
    if (args.workspaceId && workspace.id !== args.workspaceId) {
      throw new Error(
        `Profile '${args.profileId}' does not belong to workspace '${args.workspaceId}'`,
      );
    }
  } else {
    workspace = args?.workspaceId
      ? await getWorkspaceById(args.workspaceId)
      : await getFirstWorkspace();

    if (!workspace && bootstrapFromLegacy) {
      workspace = await createWorkspace({
        name: "Gipfeli",
        slug: "gipfeli",
      });
    }

    if (!workspace) {
      throw new Error("No workspace is configured");
    }

    profile = await getDefaultProfileForWorkspace(workspace.id);
    if (!profile && bootstrapFromLegacy) {
      profile = await createBootstrapProfile(workspace.id);
    }
  }

  if (!workspace || !profile) {
    throw new Error("No active workspace profile is configured");
  }

  let canonicalResume = await getCanonicalResumeByProfileId(profile.id);

  if (!canonicalResume && bootstrapFromLegacy) {
    const { resumeId } = await getConfiguredRxResumeBaseResumeId();
    if (resumeId) {
      canonicalResume = await setCanonicalResume({
        workspaceId: workspace.id,
        profileId: profile.id,
        rxresumeResumeId: resumeId,
      });
    }
  }

  return { workspace, profile, canonicalResume };
}

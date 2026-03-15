import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";

const { profiles, resumeSnapshots } = schema;

async function assertProfileInWorkspace(
  workspaceId: string,
  profileId: string,
) {
  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(eq(profiles.workspaceId, workspaceId), eq(profiles.id, profileId)),
    )
    .limit(1);

  if (!profile) {
    throw new Error(
      `Profile '${profileId}' does not belong to workspace '${workspaceId}'`,
    );
  }
}

export async function createSnapshot(input: {
  workspaceId: string;
  profileId: string;
  sourceResumeId: string;
  format: string;
  checksum: string;
  payload: string;
}): Promise<typeof resumeSnapshots.$inferSelect> {
  await assertProfileInWorkspace(input.workspaceId, input.profileId);
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(resumeSnapshots).values({
    id,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    sourceResumeId: input.sourceResumeId,
    format: input.format,
    checksum: input.checksum,
    payload: input.payload,
    createdAt: now,
  });

  const [snapshot] = await db
    .select()
    .from(resumeSnapshots)
    .where(eq(resumeSnapshots.id, id))
    .limit(1);

  if (!snapshot) {
    throw new Error(
      `Failed to create resume snapshot for profile '${input.profileId}'`,
    );
  }

  return snapshot;
}

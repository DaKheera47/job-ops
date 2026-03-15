import { randomUUID } from "node:crypto";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, schema } from "../db";

const { canonicalResumes, profiles } = schema;

async function getProfileInWorkspace(workspaceId: string, profileId: string) {
  const [profile] = await db
    .select()
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

  return profile;
}

export async function listProfilesByWorkspace(
  workspaceId: string,
): Promise<Array<typeof profiles.$inferSelect>> {
  return db
    .select()
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId))
    .orderBy(asc(profiles.createdAt), asc(profiles.id));
}

export async function setDefaultProfile(
  workspaceId: string,
  profileId: string,
): Promise<typeof profiles.$inferSelect> {
  await getProfileInWorkspace(workspaceId, profileId);

  return db.transaction((tx) => {
    const now = new Date().toISOString();

    tx.update(profiles)
      .set({
        isDefault: false,
        updatedAt: now,
      })
      .where(
        and(eq(profiles.workspaceId, workspaceId), ne(profiles.id, profileId)),
      )
      .run();

    tx.update(profiles)
      .set({
        isDefault: true,
        updatedAt: now,
      })
      .where(
        and(eq(profiles.workspaceId, workspaceId), eq(profiles.id, profileId)),
      )
      .run();

    const updated = tx
      .select()
      .from(profiles)
      .where(
        and(eq(profiles.workspaceId, workspaceId), eq(profiles.id, profileId)),
      )
      .limit(1)
      .get();

    if (!updated) {
      throw new Error(`Failed to update default profile '${profileId}'`);
    }

    return updated;
  });
}

export async function setCanonicalResume(input: {
  workspaceId: string;
  profileId: string;
  rxresumeResumeId: string;
}): Promise<typeof canonicalResumes.$inferSelect> {
  await getProfileInWorkspace(input.workspaceId, input.profileId);
  const now = new Date().toISOString();

  const [existing] = await db
    .select()
    .from(canonicalResumes)
    .where(eq(canonicalResumes.profileId, input.profileId))
    .limit(1);

  if (existing) {
    await db
      .update(canonicalResumes)
      .set({
        workspaceId: input.workspaceId,
        source: "rxresume",
        rxresumeResumeId: input.rxresumeResumeId,
        updatedAt: now,
      })
      .where(eq(canonicalResumes.id, existing.id));

    const [updated] = await db
      .select()
      .from(canonicalResumes)
      .where(eq(canonicalResumes.id, existing.id))
      .limit(1);

    if (!updated) {
      throw new Error(
        `Failed to update canonical resume for profile '${input.profileId}'`,
      );
    }

    return updated;
  }

  const id = randomUUID();
  await db.insert(canonicalResumes).values({
    id,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    source: "rxresume",
    rxresumeResumeId: input.rxresumeResumeId,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(canonicalResumes)
    .where(eq(canonicalResumes.id, id))
    .limit(1);

  if (!created) {
    throw new Error(
      `Failed to create canonical resume for profile '${input.profileId}'`,
    );
  }

  return created;
}

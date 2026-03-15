import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";

const { derivedResumeVariants, profiles } = schema;

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

export async function createDerivedVariant(input: {
  workspaceId: string;
  profileId: string;
  jobId: string;
  sourceResumeId: string;
  status?: "pending" | "ready" | "failed";
  pdfPath?: string | null;
}): Promise<typeof derivedResumeVariants.$inferSelect> {
  await assertProfileInWorkspace(input.workspaceId, input.profileId);
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(derivedResumeVariants).values({
    id,
    workspaceId: input.workspaceId,
    profileId: input.profileId,
    jobId: input.jobId,
    sourceResumeId: input.sourceResumeId,
    status: input.status ?? "pending",
    pdfPath: input.pdfPath ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [variant] = await db
    .select()
    .from(derivedResumeVariants)
    .where(eq(derivedResumeVariants.id, id))
    .limit(1);

  if (!variant) {
    throw new Error(
      `Failed to create derived resume variant for profile '${input.profileId}'`,
    );
  }

  return variant;
}

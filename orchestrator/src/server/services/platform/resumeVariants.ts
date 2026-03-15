import { db, schema } from "@server/db";
import { createDerivedVariant } from "@server/repositories/resumeVariants";
import { eq } from "drizzle-orm";
import { getCanonicalResumeAccess } from "./resumeStudio";

const { derivedResumeVariants } = schema;

export async function createDerivedVariantFromJob(
  jobId: string,
  profileId?: string,
  options?: { workspaceId?: string },
) {
  const access = await getCanonicalResumeAccess({
    profileId,
    workspaceId: options?.workspaceId,
    bootstrapFromLegacy: true,
  });

  const variant = await createDerivedVariant({
    workspaceId: access.workspace.id,
    profileId: access.profile.id,
    jobId,
    sourceResumeId: access.canonicalResume.rxresumeResumeId,
    status: "pending",
    pdfPath: null,
  });

  return {
    ...access,
    variant,
  };
}

export async function markDerivedVariantReady(
  variantId: string,
  pdfPath: string,
): Promise<void> {
  await db
    .update(derivedResumeVariants)
    .set({
      status: "ready",
      pdfPath,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(derivedResumeVariants.id, variantId));
}

export async function markDerivedVariantFailed(
  variantId: string,
): Promise<void> {
  await db
    .update(derivedResumeVariants)
    .set({
      status: "failed",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(derivedResumeVariants.id, variantId));
}

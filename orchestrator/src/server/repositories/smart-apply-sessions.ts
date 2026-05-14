/**
 * Smart Apply session repository.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getActiveTenantId } from "../tenancy/context";
import type {
  PrefilledForm,
  SmartApplyStatus,
} from "../services/smart-apply/types";

const { smartApplySessions } = schema;

export interface SmartApplySessionRecord {
  id: string;
  jobId: string;
  status: SmartApplyStatus;
  applyUrl: string;
  parsedFields: unknown;
  prefilled: PrefilledForm | null;
  viewerToken: string | null;
  viewerExpiresAt: number | null;
  submittedAt: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(
  row: typeof smartApplySessions.$inferSelect,
): SmartApplySessionRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    status: row.status as SmartApplyStatus,
    applyUrl: row.applyUrl,
    parsedFields: row.parsedFields ?? null,
    prefilled: (row.prefillValues as PrefilledForm | null) ?? null,
    viewerToken: row.viewerToken ?? null,
    viewerExpiresAt: row.viewerExpiresAt ?? null,
    submittedAt: row.submittedAt ?? null,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createSmartApplySession(input: {
  jobId: string;
  applyUrl: string;
}): Promise<SmartApplySessionRecord> {
  const tenantId = getActiveTenantId();
  const id = randomUUID();
  await db.insert(smartApplySessions).values({
    id,
    tenantId,
    jobId: input.jobId,
    status: "preparing",
    applyUrl: input.applyUrl,
  });
  const created = await getSmartApplySessionById(id);
  if (!created) throw new Error("Failed to create smart apply session");
  return created;
}

export async function getSmartApplySessionById(
  id: string,
): Promise<SmartApplySessionRecord | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(smartApplySessions)
    .where(
      and(
        eq(smartApplySessions.tenantId, tenantId),
        eq(smartApplySessions.id, id),
      ),
    );
  return row ? mapRow(row) : null;
}

export async function getActiveSmartApplySession(): Promise<SmartApplySessionRecord | null> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select()
    .from(smartApplySessions)
    .where(
      and(
        eq(smartApplySessions.tenantId, tenantId),
        eq(smartApplySessions.status, "ready"),
      ),
    )
    .orderBy(desc(smartApplySessions.updatedAt))
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateSmartApplySession(
  id: string,
  patch: Partial<{
    status: SmartApplyStatus;
    parsedFields: unknown;
    prefilled: PrefilledForm | null;
    viewerToken: string | null;
    viewerExpiresAt: number | null;
    submittedAt: number | null;
    errorMessage: string | null;
  }>,
): Promise<SmartApplySessionRecord | null> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();
  await db
    .update(smartApplySessions)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.parsedFields !== undefined
        ? { parsedFields: patch.parsedFields }
        : {}),
      ...(patch.prefilled !== undefined
        ? { prefillValues: patch.prefilled }
        : {}),
      ...(patch.viewerToken !== undefined
        ? { viewerToken: patch.viewerToken }
        : {}),
      ...(patch.viewerExpiresAt !== undefined
        ? { viewerExpiresAt: patch.viewerExpiresAt }
        : {}),
      ...(patch.submittedAt !== undefined
        ? { submittedAt: patch.submittedAt }
        : {}),
      ...(patch.errorMessage !== undefined
        ? { errorMessage: patch.errorMessage }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(smartApplySessions.tenantId, tenantId),
        eq(smartApplySessions.id, id),
      ),
    );
  return getSmartApplySessionById(id);
}

/**
 * Mark every non-terminal session as expired.  Called at boot so leftover
 * "preparing"/"ready" rows from a previous container life don't haunt us.
 */
export async function expireStaleSessions(): Promise<number> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select({ id: smartApplySessions.id })
    .from(smartApplySessions)
    .where(
      and(
        eq(smartApplySessions.tenantId, tenantId),
        eq(smartApplySessions.status, "preparing"),
      ),
    );
  const readyRows = await db
    .select({ id: smartApplySessions.id })
    .from(smartApplySessions)
    .where(
      and(
        eq(smartApplySessions.tenantId, tenantId),
        eq(smartApplySessions.status, "ready"),
      ),
    );
  const ids = [...rows, ...readyRows].map((r) => r.id);
  if (ids.length === 0) return 0;
  const now = new Date().toISOString();
  for (const id of ids) {
    await db
      .update(smartApplySessions)
      .set({ status: "expired", updatedAt: now })
      .where(eq(smartApplySessions.id, id));
  }
  return ids.length;
}

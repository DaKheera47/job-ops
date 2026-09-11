import type { PasskeyDeviceType, PasskeySummary } from "@shared/types";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index";

const { passkeyCredentials } = schema;

export type PasskeyCredential = typeof passkeyCredentials.$inferSelect;

function mapRowToSummary(row: PasskeyCredential): PasskeySummary {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    transports: row.transports,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export async function listPasskeysForUser(
  userId: string,
): Promise<PasskeySummary[]> {
  const rows = await db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId))
    .orderBy(asc(passkeyCredentials.createdAt), asc(passkeyCredentials.id));

  return rows.map(mapRowToSummary);
}

export async function countPasskeysForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId));

  return row?.count ?? 0;
}

/**
 * Credential ids are globally unique, so a discoverable-credential login can
 * resolve the owning user from the credential alone.
 */
export async function getPasskeyById(
  id: string,
): Promise<PasskeyCredential | null> {
  const [row] = await db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.id, id))
    .limit(1);

  return row ?? null;
}

export async function createPasskey(input: {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  deviceType: PasskeyDeviceType | null;
  backedUp: boolean;
  aaguid: string | null;
}): Promise<PasskeySummary> {
  const now = new Date().toISOString();
  await db.insert(passkeyCredentials).values({
    ...input,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  });

  const created = await getPasskeyById(input.id);
  if (!created) throw new Error("Failed to load created passkey");
  return mapRowToSummary(created);
}

/**
 * Backup state is reported on every assertion and flips when the user turns
 * authenticator sync on or off, so it is refreshed alongside the counter.
 */
export async function recordPasskeyAuthentication(input: {
  id: string;
  counter: number;
  lastUsedAt: number;
  deviceType: PasskeyDeviceType | null;
  backedUp: boolean;
}): Promise<void> {
  await db
    .update(passkeyCredentials)
    .set({
      counter: input.counter,
      lastUsedAt: input.lastUsedAt,
      deviceType: input.deviceType,
      backedUp: input.backedUp,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(passkeyCredentials.id, input.id));
}

export async function renamePasskey(input: {
  id: string;
  userId: string;
  name: string;
}): Promise<PasskeySummary | null> {
  const result = await db
    .update(passkeyCredentials)
    .set({ name: input.name, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(passkeyCredentials.id, input.id),
        eq(passkeyCredentials.userId, input.userId),
      ),
    );
  if (result.changes === 0) return null;

  const row = await getPasskeyById(input.id);
  return row ? mapRowToSummary(row) : null;
}

export async function deletePasskey(input: {
  id: string;
  userId: string;
}): Promise<boolean> {
  const result = await db
    .delete(passkeyCredentials)
    .where(
      and(
        eq(passkeyCredentials.id, input.id),
        eq(passkeyCredentials.userId, input.userId),
      ),
    );

  return result.changes > 0;
}

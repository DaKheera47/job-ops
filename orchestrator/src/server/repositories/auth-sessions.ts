import { eq, lte, or } from "drizzle-orm";
import { db, schema } from "../db/index";

const { authSessions } = schema;

export async function createAuthSession(args: {
  id: string;
  subject: string;
  expiresAt: number;
}): Promise<void> {
  const now = new Date().toISOString();
  await db.insert(authSessions).values({
    id: args.id,
    subject: args.subject,
    expiresAt: args.expiresAt,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getAuthSession(id: string): Promise<{
  id: string;
  subject: string;
  expiresAt: number;
  revokedAt: number | null;
} | null> {
  const [row] = await db
    .select({
      id: authSessions.id,
      subject: authSessions.subject,
      expiresAt: authSessions.expiresAt,
      revokedAt: authSessions.revokedAt,
    })
    .from(authSessions)
    .where(eq(authSessions.id, id));

  return row ?? null;
}

export async function revokeAuthSession(id: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(authSessions)
    .set({
      revokedAt: now,
      updatedAt: new Date(now * 1000).toISOString(),
    })
    .where(eq(authSessions.id, id));
}

export async function deleteExpiredOrRevokedAuthSessions(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .delete(authSessions)
    .where(
      or(lte(authSessions.expiresAt, now), lte(authSessions.revokedAt, now)),
    );
}

export async function deleteAllAuthSessions(): Promise<void> {
  await db.delete(authSessions);
}

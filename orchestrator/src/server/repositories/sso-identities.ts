import { randomUUID } from "node:crypto";
import type { SsoProvider } from "@shared/types";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";

const { ssoIdentities } = schema;

export type SsoIdentity = {
  id: string;
  tenantId: string;
  userId: string;
  provider: SsoProvider;
  issuer: string;
  subject: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
};

const identityColumns = {
  id: ssoIdentities.id,
  tenantId: ssoIdentities.tenantId,
  userId: ssoIdentities.userId,
  provider: ssoIdentities.provider,
  issuer: ssoIdentities.issuer,
  subject: ssoIdentities.subject,
  email: ssoIdentities.email,
  displayName: ssoIdentities.displayName,
  createdAt: ssoIdentities.createdAt,
  updatedAt: ssoIdentities.updatedAt,
};

/**
 * Looked up without tenant or user scoping: a federated login carries no
 * JobOps identity until this row resolves it.
 */
export async function findSsoIdentity(input: {
  provider: SsoProvider;
  issuer: string;
  subject: string;
}): Promise<SsoIdentity | null> {
  const [row] = await db
    .select(identityColumns)
    .from(ssoIdentities)
    .where(
      and(
        eq(ssoIdentities.provider, input.provider),
        eq(ssoIdentities.issuer, input.issuer),
        eq(ssoIdentities.subject, input.subject),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function listSsoIdentitiesForUser(
  userId: string,
): Promise<SsoIdentity[]> {
  return db
    .select(identityColumns)
    .from(ssoIdentities)
    .where(eq(ssoIdentities.userId, userId))
    .orderBy(asc(ssoIdentities.createdAt), asc(ssoIdentities.id));
}

export async function createSsoIdentity(input: {
  tenantId: string;
  userId: string;
  provider: SsoProvider;
  issuer: string;
  subject: string;
  email: string | null;
  displayName: string | null;
}): Promise<SsoIdentity> {
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(ssoIdentities).values({
    id,
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.provider,
    issuer: input.issuer,
    subject: input.subject,
    email: input.email,
    displayName: input.displayName,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id,
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.provider,
    issuer: input.issuer,
    subject: input.subject,
    email: input.email,
    displayName: input.displayName,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteSsoIdentity(input: {
  id: string;
  userId: string;
}): Promise<boolean> {
  const result = await db
    .delete(ssoIdentities)
    .where(
      and(
        eq(ssoIdentities.id, input.id),
        eq(ssoIdentities.userId, input.userId),
      ),
    );

  return result.changes > 0;
}

export async function countSsoIdentitiesForUser(
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ssoIdentities)
    .where(eq(ssoIdentities.userId, userId));

  return row?.count ?? 0;
}

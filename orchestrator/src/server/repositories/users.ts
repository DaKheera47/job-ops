import { randomUUID } from "node:crypto";
import { hashPassword } from "@server/auth/password";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
} from "@server/tenancy/constants";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";

const { tenantMemberships, tenants, users } = schema;

export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  passwordHash: string;
  passwordSalt: string;
  isSystemAdmin: boolean;
  isDisabled: boolean;
  tenantId: string;
  tenantName: string;
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string | null;
  isSystemAdmin: boolean;
  isDisabled: boolean;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function slugify(value: string): string {
  return (
    normalizeUsername(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "user"
  );
}

function mapUser(row: {
  id: string;
  username: string;
  displayName: string | null;
  isSystemAdmin: boolean;
  isDisabled: boolean;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
  updatedAt: string;
}): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    isSystemAdmin: row.isSystemAdmin,
    isDisabled: row.isDisabled,
    workspaceId: row.workspaceId,
    workspaceName: row.workspaceName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return row?.count ?? 0;
}

export async function getUserForLogin(
  username: string,
): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
      passwordSalt: users.passwordSalt,
      isSystemAdmin: users.isSystemAdmin,
      isDisabled: users.isDisabled,
      tenantId: tenantMemberships.tenantId,
      tenantName: tenants.name,
    })
    .from(users)
    .innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(eq(users.username, normalizeUsername(username)))
    .limit(1);

  return row ?? null;
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isSystemAdmin: users.isSystemAdmin,
      isDisabled: users.isDisabled,
      workspaceId: tenantMemberships.tenantId,
      workspaceName: tenants.name,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(eq(users.id, id))
    .limit(1);

  return row ? mapUser(row) : null;
}

export async function listUsers(): Promise<PublicUser[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isSystemAdmin: users.isSystemAdmin,
      isDisabled: users.isDisabled,
      workspaceId: tenantMemberships.tenantId,
      workspaceName: tenants.name,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId));

  return rows.map(mapUser);
}

export async function createPrivateWorkspaceUser(input: {
  username: string;
  password: string;
  displayName?: string | null;
  isSystemAdmin?: boolean;
  useDefaultTenant?: boolean;
}): Promise<PublicUser> {
  const now = new Date().toISOString();
  const username = normalizeUsername(input.username);
  const userId = randomUUID();
  const tenantId = input.useDefaultTenant ? DEFAULT_TENANT_ID : randomUUID();
  const tenantName = input.displayName?.trim() || username;
  const tenantSlug = input.useDefaultTenant
    ? "default"
    : `${slugify(username)}-${tenantId.slice(0, 8)}`;
  const { passwordHash, passwordSalt } = await hashPassword(input.password);

  db.transaction((tx) => {
    if (input.useDefaultTenant) {
      tx.insert(tenants)
        .values({
          id: DEFAULT_TENANT_ID,
          name: DEFAULT_TENANT_NAME,
          slug: "default",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
    } else {
      tx.insert(tenants)
        .values({
          id: tenantId,
          name: tenantName,
          slug: tenantSlug,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    tx.insert(users)
      .values({
        id: userId,
        username,
        displayName: input.displayName?.trim() || null,
        passwordHash,
        passwordSalt,
        isSystemAdmin: input.isSystemAdmin ?? false,
        isDisabled: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.insert(tenantMemberships)
      .values({
        id: randomUUID(),
        userId,
        tenantId,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  const user = await getUserById(userId);
  if (!user) throw new Error("Failed to load created user");
  return user;
}

export async function createInitialSystemAdmin(input: {
  username: string;
  password: string;
  displayName?: string | null;
}): Promise<PublicUser | null> {
  const now = new Date().toISOString();
  const username = normalizeUsername(input.username);
  const userId = randomUUID();
  const { passwordHash, passwordSalt } = await hashPassword(input.password);

  const created = db.transaction((tx) => {
    const existing = tx
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(users)
      .get();
    if ((existing?.count ?? 0) > 0) {
      return false;
    }

    tx.insert(tenants)
      .values({
        id: DEFAULT_TENANT_ID,
        name: DEFAULT_TENANT_NAME,
        slug: "default",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run();

    tx.insert(users)
      .values({
        id: userId,
        username,
        displayName: input.displayName?.trim() || null,
        passwordHash,
        passwordSalt,
        isSystemAdmin: true,
        isDisabled: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    tx.insert(tenantMemberships)
      .values({
        id: randomUUID(),
        userId,
        tenantId: DEFAULT_TENANT_ID,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return true;
  });

  if (!created) return null;
  const user = await getUserById(userId);
  if (!user) throw new Error("Failed to load created user");
  return user;
}

export async function setUserDisabled(
  id: string,
  isDisabled: boolean,
): Promise<PublicUser | null> {
  await db
    .update(users)
    .set({ isDisabled, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id));
  return getUserById(id);
}

export async function updateUserPassword(input: {
  id: string;
  password: string;
}): Promise<void> {
  const { passwordHash, passwordSalt } = await hashPassword(input.password);
  await db
    .update(users)
    .set({
      passwordHash,
      passwordSalt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, input.id));
}

export async function userBelongsToTenant(input: {
  userId: string;
  tenantId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: tenantMemberships.id })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.userId, input.userId),
        eq(tenantMemberships.tenantId, input.tenantId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

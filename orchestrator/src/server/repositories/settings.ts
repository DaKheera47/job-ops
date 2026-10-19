/** Persisted settings are addressed by the ownership declared in the registry. */
import { type SettingScope, settingsRegistry } from "@shared/settings-registry";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getPrivateDataScope } from "../tenancy/private-scope";

const { settings, tenantMemberships } = schema;

export type SettingKey = Exclude<
  {
    [K in keyof typeof settingsRegistry]: (typeof settingsRegistry)[K]["kind"] extends "virtual"
      ? never
      : K;
  }[keyof typeof settingsRegistry],
  undefined
>;

async function currentUserOwner(): Promise<{
  tenantId: string;
  userId: string;
}> {
  const scope = getPrivateDataScope();
  if (scope.userId) return { tenantId: scope.tenantId, userId: scope.userId };

  const memberships = await db
    .select({ userId: tenantMemberships.userId, role: tenantMemberships.role })
    .from(tenantMemberships)
    .where(eq(tenantMemberships.tenantId, scope.tenantId));
  const owner = memberships.find((membership) => membership.role === "owner");
  return {
    tenantId: scope.tenantId,
    userId: owner?.userId ?? memberships[0]?.userId ?? "__local_unowned__",
  };
}

async function ownerFor(key: SettingKey): Promise<{
  tenantId: string | null;
  userId: string | null;
}> {
  const scope = settingsRegistry[key].scope as SettingScope;
  if (scope === "platform") return { tenantId: null, userId: null };
  if (scope === "tenant") {
    return { tenantId: getPrivateDataScope().tenantId, userId: null };
  }
  return currentUserOwner();
}

function ownerWhere(
  key: SettingKey,
  owner: { tenantId: string | null; userId: string | null },
) {
  return and(
    eq(settings.key, key),
    owner.tenantId === null
      ? isNull(settings.tenantId)
      : eq(settings.tenantId, owner.tenantId),
    owner.userId === null
      ? isNull(settings.userId)
      : eq(settings.userId, owner.userId),
  );
}

export async function getSetting(key: SettingKey): Promise<string | null> {
  const owner = await ownerFor(key);
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(ownerWhere(key, owner));
  return row?.value ?? null;
}

export async function getAllSettings(): Promise<
  Partial<Record<SettingKey, string>>
> {
  const result: Partial<Record<SettingKey, string>> = {};
  const platformRows = await db
    .select()
    .from(settings)
    .where(and(isNull(settings.tenantId), isNull(settings.userId)));
  for (const row of platformRows) {
    if (settingsRegistry[row.key as SettingKey]?.scope === "platform") {
      result[row.key as SettingKey] = row.value;
    }
  }

  const { tenantId } = getPrivateDataScope();
  const tenantRows = await db
    .select()
    .from(settings)
    .where(and(eq(settings.tenantId, tenantId), isNull(settings.userId)));
  for (const row of tenantRows) {
    if (
      (
        settingsRegistry[row.key as SettingKey] as
          | { scope: SettingScope }
          | undefined
      )?.scope === "tenant"
    ) {
      result[row.key as SettingKey] = row.value;
    }
  }

  const { userId } = await currentUserOwner();
  const userRows = await db
    .select()
    .from(settings)
    .where(and(eq(settings.tenantId, tenantId), eq(settings.userId, userId)));
  for (const row of userRows) {
    if (settingsRegistry[row.key as SettingKey]?.scope === "user") {
      result[row.key as SettingKey] = row.value;
    }
  }
  return result;
}

export async function setSetting(
  key: SettingKey,
  value: string | null,
): Promise<void> {
  const owner = await ownerFor(key);
  const where = ownerWhere(key, owner);
  if (value === null) {
    await db.delete(settings).where(where);
    return;
  }
  const now = new Date().toISOString();
  await db.run(sql`INSERT INTO settings
    (tenant_id, user_id, key, value, created_at, updated_at)
    VALUES (${owner.tenantId}, ${owner.userId}, ${key}, ${value}, ${now}, ${now})
    ON CONFLICT DO UPDATE SET
      value = excluded.value, updated_at = excluded.updated_at`);
}

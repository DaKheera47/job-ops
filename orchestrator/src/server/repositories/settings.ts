/**
 * Settings repository - key/value storage for runtime configuration.
 */

import type { settingsRegistry } from "@shared/settings-registry";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { settings } = schema;

export type SettingKey = Exclude<
  {
    [K in keyof typeof settingsRegistry]: (typeof settingsRegistry)[K]["kind"] extends "virtual"
      ? never
      : K;
  }[keyof typeof settingsRegistry],
  undefined
>;

export async function getSetting(key: SettingKey): Promise<string | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));
  return row?.value ?? null;
}

export async function getAllSettings(): Promise<
  Partial<Record<SettingKey, string>>
> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.tenantId, tenantId));
  return rows.reduce(
    (acc, row) => {
      acc[row.key as SettingKey] = row.value;
      return acc;
    },
    {} as Partial<Record<SettingKey, string>>,
  );
}

export async function setSetting(
  key: SettingKey,
  value: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const tenantId = getActiveTenantId();

  if (value === null) {
    await db
      .delete(settings)
      .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));
    return;
  }

  const [existing] = await db
    .select({ key: settings.key })
    .from(settings)
    .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));

  if (existing) {
    await db
      .update(settings)
      .set({ value, updatedAt: now })
      .where(and(eq(settings.tenantId, tenantId), eq(settings.key, key)));
    return;
  }

  await db.insert(settings).values({
    tenantId,
    key,
    value,
    createdAt: now,
    updatedAt: now,
  });
}

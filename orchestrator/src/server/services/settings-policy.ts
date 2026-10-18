import { getTenantId, getUserId, isSystemAdmin } from "@infra/request-context";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { db, schema } from "@server/db";
import { getCurrentAccountEntitlements } from "@server/services/account-entitlements";
import {
  type SettingEditPolicy,
  settingsRegistry,
} from "@shared/settings-registry";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import { and, eq } from "drizzle-orm";

type SettingKey = keyof typeof settingsRegistry;

export const LLM_SETTING_KEYS: Array<keyof UpdateSettingsInput> = [
  "model",
  "modelScorer",
  "modelTailoring",
  "modelProjectSelection",
  "llmProvider",
  "llmBaseUrl",
  "llmApiKey",
  "llmPurposeOverrides",
  "llmPurposeApiKeys",
];
const llmSettingKeys = new Set<string>(LLM_SETTING_KEYS);

async function isTenantOwner(): Promise<boolean> {
  const tenantId = getTenantId();
  const userId = getUserId();
  if (!tenantId || !userId) return false;
  const [membership] = await db
    .select({ role: schema.tenantMemberships.role })
    .from(schema.tenantMemberships)
    .where(
      and(
        eq(schema.tenantMemberships.tenantId, tenantId),
        eq(schema.tenantMemberships.userId, userId),
      ),
    );
  return membership?.role === "owner";
}

export async function getEditableSettingKeys(): Promise<SettingKey[]> {
  const systemAdmin = isSystemAdmin();
  const signedIn = Boolean(getUserId());
  const tenantOwner = signedIn && (await isTenantOwner());
  const canEditLlm =
    getJobOpsAppConfig().appMode !== "hosted" ||
    (await getCurrentAccountEntitlements()).userEditableLlmSettings;
  return (
    Object.entries(settingsRegistry) as Array<
      [SettingKey, (typeof settingsRegistry)[SettingKey]]
    >
  )
    .filter(([key, definition]) => {
      if (!canEditLlm && llmSettingKeys.has(key)) return false;
      const policy = definition.editableBy as SettingEditPolicy;
      if (policy === "systemAdmin") return systemAdmin;
      if (policy === "tenantOwner") return tenantOwner;
      return signedIn;
    })
    .map(([key]) => key);
}

export async function canEditSettings(
  input: UpdateSettingsInput,
): Promise<boolean> {
  const editable = new Set(await getEditableSettingKeys());
  return Object.keys(input).every((key) => editable.has(key as SettingKey));
}

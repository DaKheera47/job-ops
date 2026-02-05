import type { UpdateSettingsInput } from "@shared/settings-schema";
import type {
  DeferredSideEffect,
  SettingsUpdateAction,
  SettingsUpdateContext,
  SettingsUpdatePlan,
  SettingUpdateHandler,
} from "./registry";
import { settingsUpdateRegistry } from "./registry";

async function runAction(action: SettingsUpdateAction): Promise<void> {
  await action.persist();
  if (action.sideEffect) {
    await action.sideEffect();
  }
}

export async function applySettingsUpdates(
  input: UpdateSettingsInput,
): Promise<SettingsUpdatePlan> {
  const context: SettingsUpdateContext = { input };
  const actions: SettingsUpdateAction[] = [];
  const deferredSideEffects = new Set<DeferredSideEffect>();

  const keys = Object.keys(input) as Array<keyof UpdateSettingsInput>;
  for (const key of keys) {
    const handler = settingsUpdateRegistry[key] as
      | SettingUpdateHandler<typeof key>
      | undefined;
    if (!handler) continue;

    const result = await handler({ key, value: input[key], context });
    actions.push(...result.actions);
    for (const deferred of result.deferredSideEffects) {
      deferredSideEffects.add(deferred);
    }
  }

  await Promise.all(actions.map(runAction));

  return {
    shouldRefreshBackupScheduler: deferredSideEffects.has(
      "refreshBackupScheduler",
    ),
  };
}

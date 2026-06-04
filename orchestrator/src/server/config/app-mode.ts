import type {
  JobOpsAppCapabilities,
  JobOpsAppMode,
  JobOpsAppStatusResponse,
} from "@shared/types";

const APP_MODE_ENV_KEY = "JOBOPS_APP_MODE";
const HOSTED_TENANT_ID_ENV_KEY = "JOBOPS_HOSTED_TENANT_ID";
const HOSTED_SIGNUPS_ENV_KEY = "JOBOPS_HOSTED_SIGNUPS_ENABLED";
const HOSTED_PLATFORM_LLM_ENV_KEY = "JOBOPS_HOSTED_PLATFORM_LLM_ENABLED";
const HOSTED_QUOTAS_ENV_KEY = "JOBOPS_HOSTED_QUOTAS_ENABLED";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", ""]);

type EnvSource = Pick<NodeJS.ProcessEnv, string>;

export type JobOpsAppConfig = JobOpsAppStatusResponse & {
  hostedTenantId: string | null;
};

function readTrimmedEnv(env: EnvSource, key: string): string {
  return env[key]?.trim() ?? "";
}

function parseAppMode(env: EnvSource): JobOpsAppMode {
  const rawMode = readTrimmedEnv(env, APP_MODE_ENV_KEY).toLowerCase();
  if (!rawMode) return "local";
  if (rawMode === "local" || rawMode === "hosted") return rawMode;
  throw new Error(
    `${APP_MODE_ENV_KEY} must be "local" or "hosted" when configured.`,
  );
}

function parseBooleanFlag(env: EnvSource, key: string): boolean {
  const normalized = readTrimmedEnv(env, key).toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new Error(
    `${key} must be a boolean flag: true/false, 1/0, yes/no, or on/off.`,
  );
}

function buildCapabilities(args: {
  appMode: JobOpsAppMode;
  hostedSignupsEnabled: boolean;
  hostedPlatformLlmEnabled: boolean;
  hostedQuotasEnabled: boolean;
}): JobOpsAppCapabilities {
  const hostedMode = args.appMode === "hosted";
  const platformLlm = hostedMode && args.hostedPlatformLlmEnabled;

  return {
    hostedSignups: hostedMode && args.hostedSignupsEnabled,
    platformLlm,
    quotas: hostedMode && args.hostedQuotasEnabled,
    userEditableLlmSettings: !platformLlm,
  };
}

export function getJobOpsAppConfig(
  env: EnvSource = process.env,
): JobOpsAppConfig {
  const appMode = parseAppMode(env);
  const hostedTenantId = readTrimmedEnv(env, HOSTED_TENANT_ID_ENV_KEY) || null;

  if (appMode === "hosted" && !hostedTenantId) {
    throw new Error(
      `${HOSTED_TENANT_ID_ENV_KEY} is required when ${APP_MODE_ENV_KEY}=hosted.`,
    );
  }

  const capabilities = buildCapabilities({
    appMode,
    hostedSignupsEnabled: parseBooleanFlag(env, HOSTED_SIGNUPS_ENV_KEY),
    hostedPlatformLlmEnabled: parseBooleanFlag(
      env,
      HOSTED_PLATFORM_LLM_ENV_KEY,
    ),
    hostedQuotasEnabled: parseBooleanFlag(env, HOSTED_QUOTAS_ENV_KEY),
  });

  return {
    appMode,
    capabilities,
    hostedTenantConfigured: appMode === "hosted" && Boolean(hostedTenantId),
    hostedTenantId: appMode === "hosted" ? hostedTenantId : null,
  };
}

export function getJobOpsAppStatus(
  env: EnvSource = process.env,
): JobOpsAppStatusResponse {
  const { appMode, capabilities, hostedTenantConfigured } =
    getJobOpsAppConfig(env);
  return { appMode, capabilities, hostedTenantConfigured };
}

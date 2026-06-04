export const JOBOPS_APP_MODE_VALUES = ["local", "hosted"] as const;

export type JobOpsAppMode = (typeof JOBOPS_APP_MODE_VALUES)[number];

export interface JobOpsAppCapabilities {
  hostedSignups: boolean;
  platformLlm: boolean;
  quotas: boolean;
  userEditableLlmSettings: boolean;
}

export interface JobOpsAppStatusResponse {
  appMode: JobOpsAppMode;
  capabilities: JobOpsAppCapabilities;
  hostedTenantConfigured: boolean;
}

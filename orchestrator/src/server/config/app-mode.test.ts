import { describe, expect, it } from "vitest";
import { getJobOpsAppConfig, getJobOpsAppStatus } from "./app-mode";

describe("hosted app-mode config", () => {
  it("defaults to local mode with hosted capabilities disabled", () => {
    expect(getJobOpsAppStatus({})).toEqual({
      appMode: "local",
      capabilities: {
        hostedSignups: false,
        platformLlm: false,
        quotas: false,
        userEditableLlmSettings: true,
      },
      hostedTenantConfigured: false,
    });
  });

  it("requires a hosted tenant id in hosted mode", () => {
    expect(() =>
      getJobOpsAppConfig({
        JOBOPS_APP_MODE: "hosted",
      }),
    ).toThrow(
      "JOBOPS_HOSTED_TENANT_ID is required when JOBOPS_APP_MODE=hosted.",
    );
  });

  it("rejects an invalid app mode", () => {
    expect(() =>
      getJobOpsAppConfig({
        JOBOPS_APP_MODE: "cloud",
      }),
    ).toThrow('JOBOPS_APP_MODE must be "local" or "hosted"');
  });

  it("rejects invalid boolean flags", () => {
    expect(() =>
      getJobOpsAppConfig({
        JOBOPS_HOSTED_SIGNUPS_ENABLED: "sometimes",
      }),
    ).toThrow("JOBOPS_HOSTED_SIGNUPS_ENABLED must be a boolean flag");
  });

  it("only activates hosted flags in hosted mode", () => {
    const localStatus = getJobOpsAppStatus({
      JOBOPS_HOSTED_SIGNUPS_ENABLED: "true",
      JOBOPS_HOSTED_PLATFORM_LLM_ENABLED: "true",
      JOBOPS_HOSTED_QUOTAS_ENABLED: "true",
      JOBOPS_HOSTED_TENANT_ID: "tenant_hosted",
    });
    expect(localStatus).toEqual({
      appMode: "local",
      capabilities: {
        hostedSignups: false,
        platformLlm: false,
        quotas: false,
        userEditableLlmSettings: true,
      },
      hostedTenantConfigured: false,
    });

    const hostedStatus = getJobOpsAppStatus({
      JOBOPS_APP_MODE: "hosted",
      JOBOPS_HOSTED_SIGNUPS_ENABLED: "true",
      JOBOPS_HOSTED_PLATFORM_LLM_ENABLED: "true",
      JOBOPS_HOSTED_QUOTAS_ENABLED: "true",
      JOBOPS_HOSTED_TENANT_ID: "tenant_hosted",
    });
    expect(hostedStatus).toEqual({
      appMode: "hosted",
      capabilities: {
        hostedSignups: true,
        platformLlm: true,
        quotas: true,
        userEditableLlmSettings: false,
      },
      hostedTenantConfigured: true,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applySettingsUpdates: vi.fn(),
  getConfiguredRxResumeBaseResumeId: vi.fn(),
  getDesignResumeStatus: vi.fn(),
  getJobOpsAppStatus: vi.fn(),
  getResume: vi.fn(),
  getSetting: vi.fn(),
  isDemoMode: vi.fn(),
  validateLlmCredentials: vi.fn(),
  validateResumeSchema: vi.fn(),
  validateRxResumeCredentials: vi.fn(),
}));

vi.mock("@server/config/app-mode", () => ({
  getJobOpsAppStatus: mocks.getJobOpsAppStatus,
}));

vi.mock("@server/config/demo", () => ({
  isDemoMode: mocks.isDemoMode,
}));

vi.mock("@server/repositories/settings", () => ({
  getSetting: mocks.getSetting,
}));

vi.mock("@server/services/auto-pdf-regeneration", () => ({
  enqueueAutoPdfRegenerationForSettingsChanges: vi.fn().mockResolvedValue(null),
}));

vi.mock("@server/services/design-resume", () => ({
  getDesignResumeStatus: mocks.getDesignResumeStatus,
}));

vi.mock("@server/services/envSettings", () => ({
  getOriginalEnvValue: vi.fn(() => null),
}));

vi.mock("@server/services/llm/credentials", () => ({
  resolveLlmApiKey: vi.fn(({ storedApiKey }) => storedApiKey ?? null),
}));

vi.mock("@server/services/llm/service", () => ({
  LlmService: vi.fn().mockImplementation(function LlmServiceMock() {
    return {
      validateCredentials: mocks.validateLlmCredentials,
    };
  }),
}));

vi.mock("@server/services/profile", () => ({
  clearProfileCache: vi.fn(),
}));

vi.mock("@server/services/rxresume", () => ({
  clearRxResumeResumeCache: vi.fn(),
  getResume: mocks.getResume,
  RxResumeAuthConfigError: class RxResumeAuthConfigError extends Error {},
  validateResumeSchema: mocks.validateResumeSchema,
  validateCredentials: mocks.validateRxResumeCredentials,
}));

vi.mock("@server/services/rxresume/baseResumeId", () => ({
  getConfiguredRxResumeBaseResumeId: mocks.getConfiguredRxResumeBaseResumeId,
}));

vi.mock("@server/services/settings-update", () => ({
  applySettingsUpdates: mocks.applySettingsUpdates,
}));

vi.mock("@infra/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@infra/request-context", () => ({
  getRequestId: vi.fn(() => "req-1"),
}));

import {
  getOnboardingStatus,
  saveOnboardingModelAction,
  saveOnboardingRxResumeAction,
} from "./onboarding-status";

describe("onboarding status engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getJobOpsAppStatus.mockReturnValue({
      appMode: "local",
      capabilities: {
        hostedSignups: false,
        platformLlm: false,
        quotas: false,
        userEditableLlmSettings: true,
      },
      hostedTenantConfigured: false,
    });
    mocks.isDemoMode.mockReturnValue(false);
    mocks.getSetting.mockImplementation(async (key: string) => {
      const values: Record<string, string | null> = {
        llmApiKey: "sk-test",
        llmProvider: "openrouter",
        llmBaseUrl: "",
        rxresumeUrl: null,
      };
      return values[key] ?? null;
    });
    mocks.getDesignResumeStatus.mockResolvedValue({
      exists: true,
      documentId: "doc-1",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    mocks.getConfiguredRxResumeBaseResumeId.mockResolvedValue({
      resumeId: null,
    });
    mocks.validateLlmCredentials.mockResolvedValue({
      valid: true,
      message: null,
    });
    mocks.validateRxResumeCredentials.mockResolvedValue({
      ok: false,
      status: 400,
      message: "Reactive Resume v5 API key is not configured.",
    });
    mocks.validateResumeSchema.mockResolvedValue({ ok: true });
    mocks.applySettingsUpdates.mockResolvedValue({
      shouldRefreshBackupScheduler: false,
      shouldClearRxResumeCaches: false,
      updatedSettingKeys: [],
    });
  });

  it("returns model as next when LLM validation fails", async () => {
    mocks.validateLlmCredentials.mockResolvedValue({
      valid: false,
      message: "LLM API key is missing.",
    });

    const status = await getOnboardingStatus();

    expect(status.complete).toBe(false);
    expect(status.nextRequirementId).toBe("model");
    expect(status.requirements[0]).toMatchObject({
      id: "model",
      status: "needs_action",
      primaryAction: "connect_model",
    });
  });

  it("returns resume as next when the model is valid but no resume is ready", async () => {
    mocks.getDesignResumeStatus.mockResolvedValue({ exists: false });

    const status = await getOnboardingStatus();

    expect(status.complete).toBe(false);
    expect(status.nextRequirementId).toBe("resume");
    expect(status.requirements[1]).toMatchObject({
      id: "resume",
      status: "needs_action",
      primaryAction: "upload_resume",
    });
  });

  it("is complete when model and resume requirements validate", async () => {
    const status = await getOnboardingStatus();

    expect(status).toMatchObject({
      complete: true,
      nextRequirementId: null,
    });
  });

  it("omits model onboarding when hosted platform LLM manages model settings", async () => {
    mocks.getJobOpsAppStatus.mockReturnValue({
      appMode: "hosted",
      capabilities: {
        hostedSignups: true,
        platformLlm: true,
        quotas: true,
        userEditableLlmSettings: false,
      },
      hostedTenantConfigured: true,
    });
    mocks.getDesignResumeStatus.mockResolvedValue({ exists: false });
    mocks.validateLlmCredentials.mockResolvedValue({
      valid: false,
      message: "LLM API key is missing.",
    });

    const status = await getOnboardingStatus();

    expect(mocks.validateLlmCredentials).not.toHaveBeenCalled();
    expect(mocks.validateRxResumeCredentials).not.toHaveBeenCalled();
    expect(status.complete).toBe(false);
    expect(status.nextRequirementId).toBe("resume");
    expect(status.requirements).toHaveLength(1);
    expect(status.requirements[0]).toMatchObject({
      id: "resume",
      status: "needs_action",
      title: "Upload your existing resume, PDF or DOCX",
    });
  });

  it("validates the model action before persisting and keeps secrets out of error details", async () => {
    mocks.validateLlmCredentials.mockResolvedValue({
      valid: false,
      message: "Invalid LLM API key. Check the key and try again.",
    });

    await expect(
      saveOnboardingModelAction({
        provider: "openrouter",
        apiKey: "sk-secret-value",
        model: "gpt-4o",
      }),
    ).rejects.toMatchObject({
      details: {
        provider: "openrouter",
        status: null,
      },
    });
    expect(mocks.applySettingsUpdates).not.toHaveBeenCalled();
  });

  it("keeps Reactive Resume blocked until a template and resume validation pass", async () => {
    mocks.getDesignResumeStatus.mockResolvedValue({ exists: false });
    mocks.validateRxResumeCredentials.mockResolvedValue({
      ok: true,
      status: null,
      message: null,
    });

    const status = await saveOnboardingRxResumeAction({
      apiKey: "rx-secret",
      baseUrl: null,
      rxresumeBaseResumeId: null,
      hasRxresumeBaseResumeId: false,
    });

    expect(mocks.applySettingsUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfRenderer: "rxresume",
        rxresumeApiKey: "rx-secret",
      }),
    );
    expect(status).toMatchObject({
      complete: false,
      nextRequirementId: "resume",
    });
    expect(status.requirements[1]).toMatchObject({
      primaryAction: "select_rxresume_template",
    });
  });
});

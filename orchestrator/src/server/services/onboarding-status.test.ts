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
  confirmOnboardingResumeAction,
  getOnboardingStatus,
  saveOnboardingModelAction,
  saveOnboardingProfileAction,
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
        model: "gpt-4o",
        rxresumeUrl: null,
        onboardingProfileCompleted: "1",
        onboardingLlmCompleted: "1",
        onboardingResumeConfirmedSource: "local:doc-1",
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

  it("returns model as next when the connection has not been completed", async () => {
    mocks.getSetting.mockImplementation(async (key: string) => {
      const values: Record<string, string | null> = {
        llmApiKey: "sk-test",
        llmProvider: "openrouter",
        llmBaseUrl: "",
        model: "gpt-4o",
        onboardingProfileCompleted: "1",
        onboardingLlmCompleted: null,
        onboardingResumeConfirmedSource: "local:doc-1",
      };
      return values[key] ?? null;
    });

    const status = await getOnboardingStatus();

    expect(status.complete).toBe(false);
    expect(status.nextRequirementId).toBe("model");
    expect(status.requirements[1]).toMatchObject({
      id: "model",
      status: "needs_action",
      primaryAction: "connect_model",
    });
    expect(mocks.applySettingsUpdates).not.toHaveBeenCalled();
  });

  it("validates and persists legacy onboarding state once", async () => {
    const values: Record<string, string | null> = {
      llmApiKey: "sk-test",
      llmProvider: "openrouter",
      llmBaseUrl: "",
      model: "gpt-4o",
      onboardingLegacyMigrationPending: "1",
      onboardingProfileCompleted: null,
      onboardingLlmCompleted: null,
      onboardingResumeConfirmedSource: null,
    };
    mocks.getSetting.mockImplementation(async (key: string) =>
      Object.hasOwn(values, key) ? values[key] : null,
    );
    mocks.applySettingsUpdates.mockImplementation(async (update) => {
      if (update.onboardingProfileCompleted !== undefined) {
        values.onboardingProfileCompleted = update.onboardingProfileCompleted
          ? "1"
          : "0";
      }
      if (update.onboardingLlmCompleted !== undefined) {
        values.onboardingLlmCompleted = update.onboardingLlmCompleted
          ? "1"
          : "0";
      }
      if (update.onboardingResumeConfirmedSource !== undefined) {
        values.onboardingResumeConfirmedSource =
          update.onboardingResumeConfirmedSource;
      }
      values.onboardingLegacyMigrationPending = "0";
      return {
        shouldRefreshBackupScheduler: false,
        shouldClearRxResumeCaches: false,
        updatedSettingKeys: [],
      };
    });

    const status = await getOnboardingStatus();

    expect(mocks.applySettingsUpdates).toHaveBeenCalledWith({
      onboardingProfileCompleted: true,
      onboardingLegacyMigrationPending: false,
      onboardingLlmCompleted: true,
      onboardingResumeConfirmedSource: "local:doc-1",
    });
    expect(status.complete).toBe(true);
  });

  it("does not trust a completed Codex marker when refreshed auth is invalid", async () => {
    mocks.getSetting.mockImplementation(async (key: string) => {
      const values: Record<string, string | null> = {
        llmApiKey: null,
        llmProvider: "codex",
        llmBaseUrl: "",
        model: "gpt-5.4-mini",
        onboardingProfileCompleted: "1",
        onboardingLlmCompleted: "1",
        onboardingResumeConfirmedSource: "local:doc-1",
      };
      return values[key] ?? null;
    });
    mocks.validateLlmCredentials.mockResolvedValue({
      valid: false,
      message: "Access token expired. Please login again.",
    });

    const status = await getOnboardingStatus();

    expect(status.complete).toBe(false);
    expect(status.nextRequirementId).toBe("model");
    expect(status.requirements[1]).toMatchObject({
      id: "model",
      status: "needs_action",
      title: "Reconnect Codex",
      primaryAction: "connect_model",
    });
    expect(status.requirements[1]?.message).toMatch(/access token expired/i);
  });

  it("returns resume as next when no resume is ready", async () => {
    mocks.getDesignResumeStatus.mockResolvedValue({ exists: false });

    const status = await getOnboardingStatus();

    expect(status.complete).toBe(false);
    expect(status.nextRequirementId).toBe("resume");
    expect(status.requirements[2]).toMatchObject({
      id: "resume",
      status: "needs_action",
      primaryAction: "upload_resume",
    });
  });

  it("keeps Ollama onboarding on the model step until a model is selected", async () => {
    mocks.getSetting.mockImplementation(async (key: string) => {
      const values: Record<string, string | null> = {
        llmApiKey: null,
        llmProvider: "ollama",
        llmBaseUrl: "http://localhost:11434",
        model: null,
        rxresumeUrl: null,
        onboardingProfileCompleted: "1",
        onboardingLlmCompleted: "1",
        onboardingResumeConfirmedSource: "local:doc-1",
      };
      return values[key] ?? null;
    });

    const status = await getOnboardingStatus();

    expect(status.complete).toBe(false);
    expect(status.nextRequirementId).toBe("model");
    expect(status.requirements[1]).toMatchObject({
      id: "model",
      status: "needs_action",
      title: "Choose an Ollama model",
      primaryAction: "connect_model",
    });
  });

  it("is complete when all durable requirements are complete", async () => {
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
    expect(status.requirements).toHaveLength(2);
    expect(status.requirements[1]).toMatchObject({
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

  it("persists profile run defaults and the durable completion marker", async () => {
    await saveOnboardingProfileAction({
      country: "United Kingdom",
      cities: ["London", "Manchester"],
      workplaceTypes: ["remote", "hybrid"],
      requiresVisaSponsorship: true,
    });

    expect(mocks.applySettingsUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        searchCities: "London|Manchester",
        workplaceTypes: ["remote", "hybrid"],
        jobspyCountryIndeed: "United Kingdom",
        showSponsorInfo: true,
        onboardingProfileCompleted: true,
      }),
    );
  });

  it("allows country-wide or remote preferences without selected cities", async () => {
    await saveOnboardingProfileAction({
      country: "United Kingdom",
      cities: [],
      workplaceTypes: ["remote"],
      requiresVisaSponsorship: false,
    });

    expect(mocks.applySettingsUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        searchCities: "",
        workplaceTypes: ["remote"],
        onboardingProfileCompleted: true,
      }),
    );
  });

  it("persists the model completion marker only after validation", async () => {
    await saveOnboardingModelAction({
      provider: "openrouter",
      apiKey: "sk-valid",
      model: "gpt-4o",
    });

    expect(mocks.applySettingsUpdates).toHaveBeenCalledWith(
      expect.objectContaining({
        llmProvider: "openrouter",
        llmApiKey: "sk-valid",
        model: "gpt-4o",
        onboardingLlmCompleted: true,
      }),
    );
  });

  it("confirms only the currently available resume source", async () => {
    await confirmOnboardingResumeAction({ source: "local:doc-1" });
    expect(mocks.applySettingsUpdates).toHaveBeenCalledWith({
      onboardingResumeConfirmedSource: "local:doc-1",
    });

    await expect(
      confirmOnboardingResumeAction({ source: "local:stale-document" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("rejects a new Ollama model action without an explicit model", async () => {
    await expect(
      saveOnboardingModelAction({
        provider: "ollama",
        baseUrl: "http://localhost:11434",
        model: null,
      }),
    ).rejects.toMatchObject({
      details: {
        provider: "ollama",
        status: null,
      },
    });
    expect(mocks.validateLlmCredentials).not.toHaveBeenCalled();
    expect(mocks.applySettingsUpdates).not.toHaveBeenCalled();
  });

  it("adds Ollama timeout guidance to model action failures", async () => {
    mocks.validateLlmCredentials.mockResolvedValue({
      valid: false,
      message: "The operation timed out.",
    });

    await expect(
      saveOnboardingModelAction({
        provider: "ollama",
        baseUrl: "http://localhost:11434",
        model: "llama3:latest",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Try a smaller or faster model"),
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
    expect(status.requirements[2]).toMatchObject({
      primaryAction: "select_rxresume_template",
    });
  });
});

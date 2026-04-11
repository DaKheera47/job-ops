import * as api from "@client/api";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useSettings } from "@client/hooks/useSettings";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHookWithQueryClient } from "../test/renderWithQueryClient";
import { useOnboardingRequirement } from "./useOnboardingRequirement";

vi.mock("@client/api", () => ({
  validateLlm: vi.fn(),
  validateRxresume: vi.fn(),
  validateResumeConfig: vi.fn(),
}));

vi.mock("@client/hooks/useDemoInfo", () => ({
  useDemoInfo: vi.fn(),
}));

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: vi.fn(),
}));

describe("useOnboardingRequirement", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
  });

  it("treats the persisted onboarding basic-auth decision as the source of truth", async () => {
    let currentSettings: any = {
      llmProvider: { value: "lmstudio", default: "lmstudio", override: null },
      llmBaseUrl: {
        value: "http://localhost:1234",
        default: "",
        override: null,
      },
      rxresumeUrl: null,
      basicAuthActive: false,
      onboardingBasicAuthDecision: null,
    };

    vi.mocked(useSettings).mockImplementation(() => ({
      settings: currentSettings,
      isLoading: false,
      refreshSettings: vi.fn(),
      error: null,
      showSponsorInfo: true,
      renderMarkdownInJobDescriptions: true,
    }));

    const { result, rerender } = renderHookWithQueryClient(() =>
      useOnboardingRequirement(),
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });
    expect(result.current.complete).toBe(false);

    currentSettings = {
      ...currentSettings,
      onboardingBasicAuthDecision: "skipped",
    };
    rerender();

    await waitFor(() => {
      expect(result.current.complete).toBe(true);
    });
  });

  it("validates non-api-key providers before treating onboarding as complete", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: false,
      message: "LM Studio is unreachable",
    });

    const currentSettings: any = {
      llmProvider: { value: "lmstudio", default: "lmstudio", override: null },
      llmBaseUrl: {
        value: "http://localhost:1234",
        default: "",
        override: null,
      },
      rxresumeUrl: null,
      basicAuthActive: false,
      onboardingBasicAuthDecision: "skipped",
    };

    vi.mocked(useSettings).mockImplementation(() => ({
      settings: currentSettings,
      isLoading: false,
      refreshSettings: vi.fn(),
      error: null,
      showSponsorInfo: true,
      renderMarkdownInJobDescriptions: true,
    }));

    const { result } = renderHookWithQueryClient(() =>
      useOnboardingRequirement(),
    );

    await waitFor(() => {
      expect(api.validateLlm).toHaveBeenCalledWith({
        provider: "lmstudio",
        baseUrl: "http://localhost:1234",
      });
    });

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.complete).toBe(false);
  });
});

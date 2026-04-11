import * as api from "@client/api";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useSettings } from "@client/hooks/useSettings";
import { writeBasicAuthDecision } from "@client/lib/onboarding";
import { act, waitFor } from "@testing-library/react";
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
    localStorage.clear();

    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    vi.mocked(useSettings).mockReturnValue({
      settings: {
        llmProvider: { value: "lmstudio", default: "lmstudio", override: null },
        llmBaseUrl: {
          value: "http://localhost:1234",
          default: "",
          override: null,
        },
        rxresumeUrl: null,
        basicAuthActive: false,
      } as any,
      isLoading: false,
      refreshSettings: vi.fn(),
      error: null,
      showSponsorInfo: true,
      renderMarkdownInJobDescriptions: true,
    });

    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });
  });

  it("updates completion when the basic-auth onboarding decision changes in the same tab", async () => {
    const { result } = renderHookWithQueryClient(() =>
      useOnboardingRequirement(),
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.complete).toBe(false);

    act(() => {
      writeBasicAuthDecision("skipped");
    });

    await waitFor(() => {
      expect(result.current.complete).toBe(true);
    });
  });
});

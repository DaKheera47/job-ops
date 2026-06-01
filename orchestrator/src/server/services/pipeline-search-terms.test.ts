import * as settingsRepo from "@server/repositories/settings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { suggestOnboardingSearchTerms } from "./onboarding-search-terms";
import { ensurePipelineSearchTerms } from "./pipeline-search-terms";

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock("./onboarding-search-terms", () => ({
  suggestOnboardingSearchTerms: vi.fn(),
}));

describe("ensurePipelineSearchTerms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(settingsRepo.getSetting).mockResolvedValue(null);
    vi.mocked(settingsRepo.setSetting).mockResolvedValue(undefined);
    vi.mocked(suggestOnboardingSearchTerms).mockResolvedValue({
      terms: ["Platform Engineer", "Backend Engineer"],
      source: "ai",
    });
  });

  it("persists explicit run terms before the pipeline starts", async () => {
    const result = await ensurePipelineSearchTerms({
      requestedSearchTerms: ["Backend Engineer", "backend engineer", " "],
    });

    expect(result).toEqual({
      searchTermsCount: 1,
      source: "request",
    });
    expect(settingsRepo.setSetting).toHaveBeenCalledWith(
      "searchTerms",
      JSON.stringify(["Backend Engineer"]),
    );
    expect(suggestOnboardingSearchTerms).not.toHaveBeenCalled();
  });

  it("keeps existing saved terms", async () => {
    vi.mocked(settingsRepo.getSetting).mockResolvedValue(
      JSON.stringify(["Existing Role"]),
    );

    const result = await ensurePipelineSearchTerms({});

    expect(result).toEqual({
      searchTermsCount: 1,
      source: "existing",
    });
    expect(settingsRepo.setSetting).not.toHaveBeenCalled();
    expect(suggestOnboardingSearchTerms).not.toHaveBeenCalled();
  });

  it("generates and saves terms when the workspace has no override", async () => {
    const result = await ensurePipelineSearchTerms({});

    expect(result).toEqual({
      searchTermsCount: 2,
      source: "generated",
    });
    expect(settingsRepo.setSetting).toHaveBeenCalledWith(
      "searchTerms",
      JSON.stringify(["Platform Engineer", "Backend Engineer"]),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveSettings } from "../services/settings";
import { buildPipelineRunSavedDetails } from "./run-details";

vi.mock("../services/settings", () => ({
  getEffectiveSettings: vi.fn(),
}));

function makeSettings() {
  return {
    jobspyCountryIndeed: {
      value: "united kingdom",
      default: "",
      override: null,
    },
    searchCities: { value: "London", default: "London", override: null },
    searchTerms: { value: ["backend engineer"], default: [], override: null },
    workplaceTypes: { value: ["hybrid"], default: [], override: null },
    locationSearchScope: {
      value: "selected_plus_remote_worldwide",
      default: "selected_only",
      override: null,
    },
    locationMatchStrictness: {
      value: "flexible",
      default: "exact_only",
      override: null,
    },
    blockedCompanyKeywords: {
      value: ["contractor"],
      default: [],
      override: null,
    },
    ukvisajobsMaxJobs: { value: 50, default: 50, override: null },
    adzunaMaxJobsPerTerm: { value: 50, default: 50, override: null },
    gradcrackerMaxJobsPerTerm: { value: 50, default: 50, override: null },
    startupjobsMaxJobsPerTerm: { value: 50, default: 50, override: null },
    jobspyResultsWanted: { value: 20, default: 20, override: null },
    autoSkipScoreThreshold: { value: 65, default: 65, override: null },
    pdfRenderer: { value: "rxresume", default: "rxresume", override: null },
    modelScorer: { value: "model-scorer", override: null },
    modelTailoring: { value: "model-tailoring", override: null },
    modelProjectSelection: { value: "model-project-selection", override: null },
    resumeProjects: {
      value: {
        maxProjects: 3,
        lockedProjectIds: ["locked-project"],
        aiSelectableProjectIds: ["project-a", "project-b"],
      },
      default: {
        maxProjects: 3,
        lockedProjectIds: [],
        aiSelectableProjectIds: [],
      },
      override: null,
    },
  } as const;
}

describe("buildPipelineRunSavedDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveSettings).mockResolvedValue(makeSettings() as never);
  });

  it("uses the request location intent instead of persisted settings", async () => {
    const savedDetails = await buildPipelineRunSavedDetails({
      topN: 5,
      minSuitabilityScore: 60,
      sources: ["gradcracker", "linkedin", "seek"],
      outputDir: "/tmp",
      locationIntent: {
        selectedCountry: "united states",
        country: "united states",
        cityLocations: ["New York"],
        workplaceTypes: ["remote"],
        geoScope: "selected_only",
        searchScope: "selected_only",
        matchStrictness: "exact_only",
      },
    } as never);

    expect(savedDetails.effectiveConfig.country).toBe("united states");
    expect(savedDetails.effectiveConfig.countryLabel).toBe("United States");
    expect(savedDetails.effectiveConfig.searchCities).toEqual(["New York"]);
    expect(savedDetails.effectiveConfig.workplaceTypes).toEqual(["remote"]);
    expect(savedDetails.effectiveConfig.locationSearchScope).toBe(
      "selected_only",
    );
    expect(savedDetails.effectiveConfig.locationMatchStrictness).toBe(
      "exact_only",
    );
    expect(savedDetails.effectiveConfig.compatibleSources).toEqual([
      "linkedin",
    ]);
    expect(savedDetails.effectiveConfig.skippedSources).toEqual([
      expect.objectContaining({
        source: "gradcracker",
      }),
      expect.objectContaining({
        source: "seek",
      }),
    ]);
  });
});

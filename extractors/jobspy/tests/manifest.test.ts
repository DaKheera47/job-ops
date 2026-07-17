import type { ExtractorRuntimeContext } from "@shared/types/extractors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runJobSpyMock } = vi.hoisted(() => ({
  runJobSpyMock: vi.fn(),
}));

vi.mock("../src/run", () => ({ runJobSpy: runJobSpyMock }));

import manifest from "../manifest";

describe("JobSpy manifest map-radius planning", () => {
  beforeEach(() => {
    runJobSpyMock.mockReset();
    runJobSpyMock.mockResolvedValue({ success: true, jobs: [] });
  });

  it("polyfills the radius with every place and shares the result allowance", async () => {
    const locations = ["Leeds", "Bradford", "Wakefield"];
    await manifest.run({
      source: "indeed",
      selectedSources: ["indeed", "linkedin"],
      settings: { jobspyResultsWanted: "50" },
      searchTerms: ["developer"],
      selectedCountry: "united kingdom",
      locationIntent: {
        selectedCountry: "united kingdom",
        country: "united kingdom",
        cityLocations: locations,
        workplaceTypes: ["onsite"],
        geoScope: "selected_only",
        searchScope: "selected_only",
        matchStrictness: "exact_only",
        proximity: { latitude: 53.8, longitude: -1.55, radiusMiles: 25 },
      },
      sourceLocationPlan: { requestedCities: locations },
    } as ExtractorRuntimeContext);

    expect(runJobSpyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locations,
        resultsWanted: 17,
      }),
    );
    expect(
      manifest.locationCapabilities?.indeed?.supportsNativeRadius,
    ).not.toBe(true);
    expect(
      manifest.locationCapabilities?.linkedin?.supportsNativeRadius,
    ).not.toBe(true);
    expect(
      manifest.locationCapabilities?.glassdoor?.supportsNativeRadius,
    ).not.toBe(true);
  });

  it("keeps the configured allowance for manual cities", async () => {
    const locations = ["Leeds", "Bradford"];
    await manifest.run({
      source: "indeed",
      selectedSources: ["indeed"],
      settings: { jobspyResultsWanted: "50" },
      searchTerms: ["developer"],
      selectedCountry: "united kingdom",
      sourceLocationPlan: { requestedCities: locations },
    } as ExtractorRuntimeContext);

    expect(runJobSpyMock).toHaveBeenCalledWith(
      expect.objectContaining({ locations, resultsWanted: 50 }),
    );
  });
});

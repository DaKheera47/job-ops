import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/run", () => ({
  runHiringCafe: vi.fn(),
}));

describe("hiringcafe manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers normalized source location plan over legacy city settings", async () => {
    const { manifest } = await import("../manifest");
    const { runHiringCafe } = await import("../src/run");
    const runHiringCafeMock = vi.mocked(runHiringCafe);
    runHiringCafeMock.mockResolvedValue({
      success: true,
      jobs: [],
    });

    await manifest.run({
      source: "hiringcafe",
      selectedSources: ["hiringcafe"],
      settings: {
        searchCities: "Bristol",
        workplaceTypes: JSON.stringify(["onsite"]),
      },
      searchTerms: ["web developer"],
      selectedCountry: "united kingdom",
      locationIntent: {
        selectedCountry: "united kingdom",
        country: "united kingdom",
        cityLocations: ["Manchester"],
        workplaceTypes: ["remote", "hybrid"],
        geoScope: "selected_only",
        matchStrictness: "strict",
      },
      sourceLocationPlan: {
        source: "hiringcafe",
        capabilities: {
          source: "hiringcafe",
          supportedCountryKeys: null,
          requiresCityLocations: false,
        },
        intent: {
          selectedCountry: "united kingdom",
          country: "united kingdom",
          cityLocations: ["Manchester"],
          workplaceTypes: ["remote", "hybrid"],
          geoScope: "selected_only",
          matchStrictness: "strict",
        },
        requestedCountry: "united kingdom",
        requestedCities: ["Leeds", "London"],
        allowRemoteWorldwide: false,
        prioritizeSelectedLocation: false,
        isCompatible: true,
        canRun: true,
        reasons: [],
        warnings: [],
      },
    });

    expect(runHiringCafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "united kingdom",
        countryKey: "united kingdom",
        locations: ["Leeds", "London"],
        workplaceTypes: ["remote", "hybrid"],
      }),
    );
  });

  it("falls back to legacy settings when normalized location context is absent", async () => {
    const { manifest } = await import("../manifest");
    const { runHiringCafe } = await import("../src/run");
    const runHiringCafeMock = vi.mocked(runHiringCafe);
    runHiringCafeMock.mockResolvedValue({
      success: true,
      jobs: [],
    });

    await manifest.run({
      source: "hiringcafe",
      selectedSources: ["hiringcafe"],
      settings: {
        searchCities: "Bristol|Cardiff",
        workplaceTypes: JSON.stringify(["onsite"]),
      },
      searchTerms: ["web developer"],
      selectedCountry: "united kingdom",
    });

    expect(runHiringCafeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        locations: ["Bristol", "Cardiff"],
        workplaceTypes: ["onsite"],
      }),
    );
  });
});

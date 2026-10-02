import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/run", () => ({
  runHiringCafe: vi.fn(),
}));

describe("hiringcafe manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes detail challenge warnings and listing jobs to the pipeline", async () => {
    const { manifest } = await import("../manifest");
    const { runHiringCafe } = await import("../src/run");
    const job = {
      source: "hiringcafe" as const,
      title: "Engineer",
      employer: "Acme",
      jobUrl: "https://hiringcafe.com/job/req-1",
      location: "London",
    };
    vi.mocked(runHiringCafe).mockResolvedValue({
      success: true,
      jobs: [job],
      sourceErrors: [
        "Hiring Cafe job detail request was challenged (HTTP 429)",
      ],
      challengeRequired: "https://hiringcafe.com/job/req-1",
    });

    const result = await manifest.run({
      source: "hiringcafe",
      selectedSources: ["hiringcafe"],
      settings: {},
      searchTerms: ["engineer"],
      selectedCountry: "worldwide",
    });

    expect(result).toEqual({
      success: true,
      jobs: [job],
      sourceErrors: [expect.stringContaining("HTTP 429")],
      challengeRequired: "https://hiringcafe.com/job/req-1",
    });
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

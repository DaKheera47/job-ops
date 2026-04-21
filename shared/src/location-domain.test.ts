import { describe, expect, it } from "vitest";
import {
  buildLocationEvidence,
  createLocationIntent,
  createLocationIntentFromLegacyInputs,
  describeLocationIntent,
  getLegacyLocationSelection,
  getPrimaryLocationLabel,
  matchLocationIntent,
  normalizeLocationSourceCapabilities,
  planLocationSources,
} from "./location-domain";

describe("location-domain", () => {
  it("normalizes intent values and deduplicates cities and workplace types", () => {
    expect(
      createLocationIntent({
        selectedCountry: "UK",
        cityLocations: ["Leeds", "london", "Leeds"],
        workplaceTypes: ["remote", "onsite", "remote", "hybrid"],
        searchScope: "remote_worldwide_prioritize_selected",
        matchStrictness: "flexible",
      }),
    ).toEqual({
      selectedCountry: "united kingdom",
      country: "united kingdom",
      cityLocations: ["Leeds", "london"],
      workplaceTypes: ["remote", "onsite", "hybrid"],
      geoScope: "remote_worldwide_prioritize_selected",
      searchScope: "remote_worldwide_prioritize_selected",
      matchStrictness: "flexible",
    });
  });

  it("normalizes legacy intent inputs and evidence payloads", () => {
    expect(
      createLocationIntentFromLegacyInputs({
        country: "UK",
        searchCities: "Leeds|London",
        searchScope: "selected_plus_remote_worldwide",
        matchStrictness: "flexible",
      }),
    ).toEqual({
      selectedCountry: "united kingdom",
      country: "united kingdom",
      cityLocations: ["Leeds", "London"],
      workplaceTypes: [],
      geoScope: "selected_plus_remote_worldwide",
      searchScope: "selected_plus_remote_worldwide",
      matchStrictness: "flexible",
    });

    expect(
      buildLocationEvidence([
        {
          kind: "location",
          value: "Remote - Worldwide",
          sourceField: "location",
        },
        {
          kind: "country",
          value: "UK",
        },
      ]),
    ).toMatchObject({
      location: "Remote - Worldwide",
      country: "united kingdom",
      source: null,
      isRemote: true,
    });
  });

  it("describes location intent using the current preference wording", () => {
    expect(
      describeLocationIntent({
        selectedCountry: "UK",
        cityLocations: ["Leeds", "London"],
        workplaceTypes: ["remote", "hybrid", "onsite"],
        searchScope: "selected_plus_remote_worldwide",
        matchStrictness: "flexible",
      }),
    ).toBe(
      "You'll get hybrid and onsite jobs in Leeds and London in United Kingdom plus remote jobs worldwide. Likely matches are included.",
    );
  });

  it("plans source compatibility based on the selected country", () => {
    const result = planLocationSources({
      intent: {
        selectedCountry: "united states",
        cityLocations: ["New York"],
        workplaceTypes: ["remote"],
        searchScope: "selected_plus_remote_worldwide",
        matchStrictness: "exact_only",
      },
      sources: [
        "gradcracker",
        "indeed",
        "glassdoor",
        "ukvisajobs",
        "adzuna",
        "startupjobs",
      ],
    });

    expect(result.compatibleSources).toEqual([
      "indeed",
      "glassdoor",
      "adzuna",
      "startupjobs",
    ]);
    expect(result.incompatibleSources).toEqual(["gradcracker", "ukvisajobs"]);
    expect(result.plans[0]).toMatchObject({
      source: "gradcracker",
      isCompatible: false,
      canRun: false,
    });
    expect(result.plans[0]?.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("Selected country")]),
    );
  });

  it("marks glassdoor incompatible until at least one city is provided", () => {
    const result = planLocationSources({
      intent: {
        selectedCountry: "united kingdom",
        cityLocations: [],
        workplaceTypes: ["remote"],
        searchScope: "selected_only",
        matchStrictness: "exact_only",
      },
      sources: ["glassdoor", "linkedin"],
    });

    expect(result.compatibleSources).toEqual(["linkedin"]);
    expect(result.incompatibleSources).toEqual(["glassdoor"]);
    expect(result.plans[0]).toMatchObject({
      source: "glassdoor",
      isCompatible: false,
      canRun: false,
    });
    expect(result.plans[0]?.reasons).toContain(
      "At least one city is required for this source.",
    );
  });

  it("matches selected locations before remote worldwide and keeps tie priority", () => {
    const intent = {
      selectedCountry: "croatia",
      cityLocations: ["Zagreb"],
      workplaceTypes: ["remote"],
      searchScope: "remote_worldwide_prioritize_selected",
      matchStrictness: "exact_only",
    } as const;

    expect(
      matchLocationIntent(intent, { location: "Zagreb, Croatia" }),
    ).toMatchObject({
      matched: true,
      matchedBy: "selected_location",
      reasonCode: "selected_location",
      priority: 1,
      countryMatched: true,
      cityMatched: true,
      remoteMatched: false,
    });

    expect(
      matchLocationIntent(intent, {
        location: "Remote - Worldwide",
        isRemote: true,
      }),
    ).toMatchObject({
      matched: true,
      matchedBy: "remote_worldwide",
      reasonCode: "remote_worldwide",
      priority: 0,
      countryMatched: false,
      cityMatched: false,
      remoteMatched: true,
    });
  });

  it("keeps flexible city matching available after country matches", () => {
    expect(
      matchLocationIntent(
        {
          selectedCountry: "croatia",
          cityLocations: ["Zagreb"],
          workplaceTypes: ["onsite"],
          searchScope: "selected_only",
          matchStrictness: "flexible",
        },
        { location: "Croatia" },
      ),
    ).toMatchObject({
      matched: true,
      matchedBy: "selected_location",
      reasonCode: "selected_location",
      priority: 1,
      cityMatched: false,
      remoteMatched: false,
    });
  });

  it("exposes legacy location labels for compatibility", () => {
    const intent = createLocationIntent({
      selectedCountry: "croatia",
      cityLocations: ["Zagreb"],
      workplaceTypes: ["remote"],
      searchScope: "remote_worldwide_prioritize_selected",
      matchStrictness: "exact_only",
    });

    expect(getLegacyLocationSelection(intent)).toBe("croatia");
    expect(getPrimaryLocationLabel(intent)).toBe("Zagreb in Croatia");
  });

  it("exposes normalized source capabilities for known sources", () => {
    expect(
      normalizeLocationSourceCapabilities({ source: "gradcracker" }),
    ).toEqual({
      requiresCityLocations: false,
      source: "gradcracker",
      supportedCountryKeys: ["united kingdom"],
    });
    expect(normalizeLocationSourceCapabilities({ source: "seek" })).toEqual({
      requiresCityLocations: false,
      source: "seek",
      supportedCountryKeys: ["australia", "new zealand"],
    });
    expect(
      normalizeLocationSourceCapabilities({ source: "startupjobs" }),
    ).toEqual({
      requiresCityLocations: false,
      source: "startupjobs",
      supportedCountryKeys: null,
    });
  });

  it("preserves default city requirements when overriding supported countries", () => {
    expect(
      normalizeLocationSourceCapabilities({
        source: "glassdoor",
        supportedCountryKeys: ["united kingdom"],
      }),
    ).toEqual({
      requiresCityLocations: true,
      source: "glassdoor",
      supportedCountryKeys: ["united kingdom"],
    });
  });

  it("treats worldwide as an explicit selected country", () => {
    expect(
      createLocationIntent({
        selectedCountry: "worldwide",
        cityLocations: [],
        workplaceTypes: ["remote"],
        searchScope: "selected_plus_remote_worldwide",
        matchStrictness: "exact_only",
      }),
    ).toMatchObject({
      selectedCountry: "worldwide",
      country: "worldwide",
    });
  });

  it("marks country-scoped sources incompatible when no country is selected", () => {
    const result = planLocationSources({
      intent: {
        selectedCountry: null,
        cityLocations: [],
        workplaceTypes: ["remote"],
        searchScope: "selected_plus_remote_worldwide",
        matchStrictness: "exact_only",
      },
      sources: ["adzuna", "startupjobs"],
    });

    expect(result.compatibleSources).toEqual(["startupjobs"]);
    expect(result.incompatibleSources).toEqual(["adzuna"]);
    expect(result.plans[0]).toMatchObject({
      source: "adzuna",
      isCompatible: false,
      canRun: false,
    });
    expect(result.plans[0]?.reasons).toContain(
      "A selected country is required for this source.",
    );
  });
});

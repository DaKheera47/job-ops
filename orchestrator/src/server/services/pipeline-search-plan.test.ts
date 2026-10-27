import type { ExtractorRegistry } from "@server/extractors/registry";
import type { PipelineSearchPresetConfig } from "@shared/types";
import { describe, expect, it, vi } from "vitest";

vi.mock("@server/extractors/registry", () => ({
  getExtractorRegistry: vi.fn(),
}));
vi.mock("@server/services/hosted-usage", () => ({
  withHostedUsageReservation: vi.fn(),
}));
vi.mock("@server/services/modelSelection", () => ({
  createConfiguredLlmService: vi.fn(),
  resolveLlmModel: vi.fn(),
}));
vi.mock("@server/services/profile", () => ({ getProfile: vi.fn() }));

import { normalizePipelineSearchPlanConfig } from "./pipeline-search-plan";

const registry = {
  manifestBySource: new Map([["linkedin", {}]]),
  locationCapabilitiesBySource: {},
} as unknown as ExtractorRegistry;

const currentConfig: PipelineSearchPresetConfig = {
  searchTerms: ["Backend Engineer"],
  sources: ["linkedin"],
  country: "united kingdom",
  cityLocations: [],
  locationMode: "radius",
  proximity: { latitude: 54.5, longitude: -3, radiusMiles: 50 },
  workplaceTypes: ["hybrid"],
  searchScope: "selected_only",
  matchStrictness: "exact_only",
  topN: 10,
  minSuitabilityScore: 50,
  runBudget: 300,
  scoringInstructions: "",
};

describe("search plan location review", () => {
  it("uses generated cities instead of a previous map area", () => {
    const { config } = normalizePipelineSearchPlanConfig({
      currentConfig,
      registry,
      candidate: { cityLocations: ["Manchester"] },
    });
    expect(config).toMatchObject({
      locationMode: "cities",
      cityLocations: ["Manchester"],
      proximity: null,
    });
    expect(currentConfig.proximity).not.toBeNull();
  });

  it("keeps the current radius when no city was requested", () => {
    const { config } = normalizePipelineSearchPlanConfig({
      currentConfig,
      registry,
      candidate: { searchTerms: ["Platform Engineer"] },
    });
    expect(config.locationMode).toBe("radius");
    expect(config.proximity).toEqual(currentConfig.proximity);
  });

  it("does not carry search details between workspaces", () => {
    const secondWorkspace = {
      ...currentConfig,
      country: "united states",
      searchTerms: ["Data Analyst"],
      scoringInstructions: "Prefer healthcare",
    };
    const first = normalizePipelineSearchPlanConfig({
      currentConfig,
      registry,
      candidate: { cityLocations: ["Manchester"] },
    });
    const second = normalizePipelineSearchPlanConfig({
      currentConfig: secondWorkspace,
      registry,
      candidate: null,
    });
    expect(first.config.country).toBe("united kingdom");
    expect(second.config).toMatchObject({
      country: "united states",
      searchTerms: ["Data Analyst"],
      cityLocations: [],
      scoringInstructions: "Prefer healthcare",
      locationMode: "radius",
    });
    expect(secondWorkspace.cityLocations).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  deriveIsRemoteFlag,
  parseJobSpyProgressLine,
  resolveJobSpyCountryIndeed,
  resolveJobSpyLocations,
  resolveJobSpySiteLocations,
} from "../src/run";

describe("parseJobSpyProgressLine", () => {
  it("parses term_start progress lines", () => {
    const event = parseJobSpyProgressLine(
      'JOBOPS_PROGRESS {"event":"term_start","termIndex":1,"termTotal":3,"searchTerm":"engineer"}',
    );

    expect(event).toEqual({
      type: "term_start",
      termIndex: 1,
      termTotal: 3,
      searchTerm: "engineer",
    });
  });

  it("parses term_complete progress lines", () => {
    const event = parseJobSpyProgressLine(
      'JOBOPS_PROGRESS {"event":"term_complete","termIndex":2,"termTotal":3,"searchTerm":"frontend","jobsFoundTerm":17}',
    );

    expect(event).toEqual({
      type: "term_complete",
      termIndex: 2,
      termTotal: 3,
      searchTerm: "frontend",
      jobsFoundTerm: 17,
    });
  });

  it("returns null for malformed payloads", () => {
    expect(parseJobSpyProgressLine("JOBOPS_PROGRESS {bad json")).toBeNull();
    expect(parseJobSpyProgressLine("JOBOPS_PROGRESS {}")).toBeNull();
  });

  it("returns null for non-progress lines", () => {
    expect(parseJobSpyProgressLine("Found 20 jobs")).toBeNull();
  });

  it("maps remote-only workplace types to isRemote", () => {
    expect(deriveIsRemoteFlag(["remote"])).toBe(true);
  });

  it("does not force JobSpy remote filtering for hybrid or onsite selections", () => {
    expect(deriveIsRemoteFlag(["hybrid"])).toBeUndefined();
    expect(deriveIsRemoteFlag(["onsite"])).toBeUndefined();
    expect(deriveIsRemoteFlag(["remote", "hybrid"])).toBeUndefined();
    expect(deriveIsRemoteFlag(["remote", "hybrid", "onsite"])).toBeUndefined();
  });

  it("runs a country-only search when no city locations are configured", () => {
    expect(resolveJobSpyLocations({ location: null, locations: [] })).toEqual([
      null,
    ]);
  });

  it("does not fall back country_indeed to UK when none is configured", () => {
    expect(resolveJobSpyCountryIndeed({ countryIndeed: null })).toBeNull();
  });

  it("uses the selected country as LinkedIn's location for country-only runs", () => {
    expect(
      resolveJobSpySiteLocations({
        location: null,
        countryIndeed: "croatia",
      }),
    ).toEqual({
      linkedinLocation: "croatia",
      indeedLocation: null,
      glassdoorLocation: null,
    });
  });

  it("keeps explicit locations for all JobSpy sites when a city is set", () => {
    expect(
      resolveJobSpySiteLocations({
        location: "Zagreb",
        countryIndeed: "croatia",
      }),
    ).toEqual({
      linkedinLocation: "Zagreb",
      indeedLocation: "Zagreb",
      glassdoorLocation: "Zagreb",
    });
  });
});

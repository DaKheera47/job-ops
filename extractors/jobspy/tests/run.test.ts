import { matchJobLocationIntent } from "@shared/job-matching.js";
import { describe, expect, it } from "vitest";
import {
  deriveIsRemoteFlag,
  mapJobSpyRows,
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

  it("parses source_error progress lines", () => {
    const event = parseJobSpyProgressLine(
      'JOBOPS_PROGRESS {"event":"source_error","source":"linkedin","searchTerm":"forecasting","error":"ValueError: Invalid country string: eswatini"}',
    );

    expect(event).toEqual({
      type: "source_error",
      source: "linkedin",
      searchTerm: "forecasting",
      error: "ValueError: Invalid country string: eswatini",
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
      linkedinLocation: "Zagreb, croatia",
      indeedLocation: "Zagreb",
      glassdoorLocation: "Zagreb",
    });
  });
});

describe("LinkedIn country-qualified queries", () => {
  it("does not append a duplicate or worldwide country", () => {
    expect(
      resolveJobSpySiteLocations({
        location: "New York, NY, US",
        countryIndeed: "united states",
      }).linkedinLocation,
    ).toBe("New York, NY, US");
    expect(
      resolveJobSpySiteLocations({
        location: "New York",
        countryIndeed: "worldwide",
      }).linkedinLocation,
    ).toBe("New York");
    expect(
      resolveJobSpySiteLocations({ location: "New York", countryIndeed: null })
        .linkedinLocation,
    ).toBe("New York");
  });
});

describe("JobSpy location evidence", () => {
  const row = {
    site: "linkedin",
    job_url: "https://example.com/job",
    title: "Engineer",
    company: "Example",
    location: "New York, NY",
  };
  const intent = {
    selectedCountry: "united states",
    country: "united states",
    cityLocations: ["New York City"],
    workplaceTypes: ["onsite" as const],
    geoScope: "selected_only" as const,
    searchScope: "selected_only" as const,
    matchStrictness: "flexible" as const,
  };

  it("keeps country-less LinkedIn results from country-qualified searches", () => {
    const [job] = mapJobSpyRows([row], "united states");
    expect(job.locationEvidence).toMatchObject({
      location: "New York, NY",
      country: "US",
    });
    expect(matchJobLocationIntent(job, intent).matched).toBe(true);
  });

  it.each(["US", "USA"])("keeps Indeed locations ending in %s", (suffix) => {
    const [job] = mapJobSpyRows(
      [{ ...row, site: "indeed", location: `New York, NY, ${suffix}` }],
      "united states",
    );
    expect(matchJobLocationIntent(job, intent).matched).toBe(true);
  });

  it("preserves explicit foreign countries over the LinkedIn search country", () => {
    for (const location of [
      "Toronto, Canada",
      "Toronto, ON, CA",
      "Berlin, Germany",
      "Berlin, BE, DE",
      "London, UK",
    ]) {
      const [job] = mapJobSpyRows([{ ...row, location }], "united states");
      expect(matchJobLocationIntent(job, intent).matched).toBe(false);
    }
  });

  it("does not interpret a US state abbreviation as country evidence", () => {
    const [job] = mapJobSpyRows(
      [{ ...row, location: "San Francisco, CA" }],
      "united states",
    );
    expect(job.locationEvidence?.country).toBe("US");
  });

  it("does not manufacture country evidence for unknown or unscoped locations", () => {
    expect(mapJobSpyRows([row])[0].locationEvidence?.country).toBeUndefined();
    expect(
      mapJobSpyRows([row], "worldwide")[0].locationEvidence?.country,
    ).toBeUndefined();
    expect(
      mapJobSpyRows([{ ...row, location: null }], "united states")[0]
        .locationEvidence,
    ).toBeUndefined();
    expect(
      mapJobSpyRows([{ ...row, site: "indeed" }], "united states")[0]
        .locationEvidence?.country,
    ).toBeUndefined();
  });

  it("keeps country evidence isolated between workspace search contexts", () => {
    const [usJob] = mapJobSpyRows([row], "united states");
    const [caJob] = mapJobSpyRows(
      [{ ...row, location: "Toronto, ON" }],
      "canada",
    );
    const [unscopedJob] = mapJobSpyRows([row]);
    expect(usJob.locationEvidence?.country).toBe("US");
    expect(caJob.locationEvidence?.country).toBe("CA");
    expect(unscopedJob.locationEvidence?.country).toBeUndefined();
    expect(usJob.locationEvidence?.country).toBe("US");
  });
});

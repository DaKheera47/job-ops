import {
  EXTRACTOR_SOURCE_METADATA,
  PIPELINE_EXTRACTOR_SOURCE_IDS,
} from "@shared/extractors";
import { createAppSettings, createJob } from "@shared/testing/factories.js";
import { describe, expect, it } from "vitest";
import {
  extractEmploymentTypes,
  getEnabledSources,
  getJobCounts,
  matchesEmploymentType,
  matchesLocation,
  matchesPostedWithin,
} from "./utils";

describe("orchestrator utils", () => {
  it("enables adzuna only when both app id and key are configured", () => {
    const withCreds = createAppSettings({
      adzunaAppId: "app-id",
      adzunaAppKeyHint: "key-",
    });
    const withoutKey = createAppSettings({
      adzunaAppId: "app-id",
      adzunaAppKeyHint: null,
    });

    expect(getEnabledSources(withCreds)).toContain("adzuna");
    expect(getEnabledSources(withoutKey)).not.toContain("adzuna");
  });

  it("enables every credential-free pipeline source", () => {
    const enabled = getEnabledSources(createAppSettings());
    const credentialFree = PIPELINE_EXTRACTOR_SOURCE_IDS.filter(
      (source) => !EXTRACTOR_SOURCE_METADATA[source].requiresCredentials,
    );

    expect(enabled).toEqual(expect.arrayContaining(credentialFree));
  });

  it("enables seek only when apify token is configured", () => {
    const withToken = createAppSettings({ apifyTokenHint: "sk-" });
    const withoutToken = createAppSettings({ apifyTokenHint: null });
    expect(getEnabledSources(withToken)).toContain("seek");
    expect(getEnabledSources(withoutToken)).not.toContain("seek");
  });

  it("counts processing jobs in ready and discovered tabs", () => {
    const jobs = [
      createJob({ id: "ready", status: "ready", closedAt: null }),
      createJob({ id: "processing", status: "processing", closedAt: null }),
      createJob({ id: "discovered", status: "discovered", closedAt: null }),
      createJob({ id: "applied", status: "applied", closedAt: null }),
    ];

    expect(getJobCounts(jobs)).toEqual({
      ready: 2,
      discovered: 2,
      applied: 1,
      all: 4,
    });
  });

  describe("extractEmploymentTypes", () => {
    it("maps free-text variants onto canonical buckets", () => {
      expect([...extractEmploymentTypes("Full-time")]).toEqual(["full_time"]);
      expect([...extractEmploymentTypes("fulltime")]).toEqual(["full_time"]);
      expect([...extractEmploymentTypes("Permanent")]).toEqual(["full_time"]);
      expect([...extractEmploymentTypes("Part time")]).toEqual(["part_time"]);
      expect([...extractEmploymentTypes("Freelance")]).toEqual(["contract"]);
      expect([...extractEmploymentTypes("Internship")]).toEqual(["internship"]);
    });

    it("returns multiple types when a string lists several", () => {
      const types = extractEmploymentTypes("Full-time, Contract");
      expect(types.has("full_time")).toBe(true);
      expect(types.has("contract")).toBe(true);
    });

    it("returns an empty set for unknown or missing input", () => {
      expect(extractEmploymentTypes(null).size).toBe(0);
      expect(extractEmploymentTypes("Gig").size).toBe(0);
    });
  });

  describe("matchesEmploymentType", () => {
    it("keeps all jobs when no type is selected", () => {
      const job = createJob({ jobType: null });
      expect(matchesEmploymentType(job, [])).toBe(true);
    });

    it("matches on any selected type and excludes unknown types", () => {
      const fullTime = createJob({ jobType: "Full-time" });
      const unknown = createJob({ jobType: null });
      expect(matchesEmploymentType(fullTime, ["full_time", "contract"])).toBe(
        true,
      );
      expect(matchesEmploymentType(fullTime, ["part_time"])).toBe(false);
      expect(matchesEmploymentType(unknown, ["full_time"])).toBe(false);
    });
  });

  describe("matchesLocation", () => {
    it("keeps all jobs for an empty query", () => {
      expect(matchesLocation(createJob({ location: "London" }), "  ")).toBe(
        true,
      );
    });

    it("matches tokens regardless of order or punctuation", () => {
      const job = createJob({ location: "London, UK" });
      expect(matchesLocation(job, "uk london")).toBe(true);
      expect(matchesLocation(job, "london")).toBe(true);
      expect(matchesLocation(job, "berlin")).toBe(false);
    });

    it("excludes jobs without a location while filtering", () => {
      expect(matchesLocation(createJob({ location: null }), "london")).toBe(
        false,
      );
    });
  });

  describe("matchesPostedWithin", () => {
    const now = Date.parse("2026-06-10T12:00:00.000Z");

    it("keeps all jobs when no window is set", () => {
      expect(
        matchesPostedWithin(createJob({ datePosted: null }), null, now),
      ).toBe(true);
    });

    it("keeps jobs inside the window and drops older / unparseable ones", () => {
      const fresh = createJob({ datePosted: "2026-06-09" });
      const old = createJob({ datePosted: "2026-05-01" });
      const relative = createJob({ datePosted: "2 days ago" });
      const unknown = createJob({ datePosted: null });

      expect(matchesPostedWithin(fresh, 7, now)).toBe(true);
      expect(matchesPostedWithin(relative, 7, now)).toBe(true);
      expect(matchesPostedWithin(old, 7, now)).toBe(false);
      expect(matchesPostedWithin(unknown, 7, now)).toBe(false);
    });
  });
});

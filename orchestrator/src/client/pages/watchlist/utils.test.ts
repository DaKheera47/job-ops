import { describe, expect, it } from "vitest";
import {
  getNormalizedWatchlistCareersUrl,
  getWatchlistPreviewLabel,
  getWatchlistSelectionIdentityKey,
  getWatchlistSourceKey,
} from "./utils";

describe("getWatchlistSourceKey", () => {
  it("uses parsed tenant and site for myworkdaysite URLs", () => {
    expect(
      getWatchlistSourceKey(
        "https://wd5.myworkdaysite.com/recruiting/acme/Careers",
      ),
    ).toBe("workday:acme:careers");
  });

  it("distinguishes sources that share the same myworkdaysite host", () => {
    const acme = getWatchlistSourceKey(
      "https://wd5.myworkdaysite.com/recruiting/acme/Careers",
    );
    const globex = getWatchlistSourceKey(
      "https://wd5.myworkdaysite.com/recruiting/globex/Jobs",
    );

    expect(acme).toBe("workday:acme:careers");
    expect(globex).toBe("workday:globex:jobs");
    expect(acme).not.toBe(globex);
  });

  it("uses the same key for equivalent CXS endpoints", () => {
    expect(
      getWatchlistSourceKey(
        "https://wd5.myworkdaysite.com/wday/cxs/acme/Careers/jobs",
      ),
    ).toBe("workday:acme:careers");
  });

  it("normalizes BambooHR preview URLs to the careers root", () => {
    expect(
      getNormalizedWatchlistCareersUrl(
        "bamboohr",
        "https://ashteadtechnology.bamboohr.com/careers/134/detail",
      ),
    ).toBe("https://ashteadtechnology.bamboohr.com/careers");
  });

  it("derives a source-aware BambooHR preview label", () => {
    expect(
      getWatchlistPreviewLabel(
        "bamboohr",
        "https://ashteadtechnology.bamboohr.com/careers/134/detail",
      ),
    ).toBe("Ashteadtechnology");
  });

  it("matches equivalent BambooHR selections even when labels differ", () => {
    const saved = getWatchlistSelectionIdentityKey({
      catalogSourceId: null,
      sourceType: "bamboohr",
      careersUrl: "https://ashteadtechnology.bamboohr.com/careers",
    });
    const draft = getWatchlistSelectionIdentityKey({
      catalogSourceId: null,
      sourceType: "bamboohr",
      careersUrl: "https://ashteadtechnology.bamboohr.com/careers/134/detail",
    });

    expect(saved).toBe(draft);
  });
});

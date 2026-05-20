import { describe, expect, it } from "vitest";
import { getWatchlistSourceKey } from "./utils";

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
});

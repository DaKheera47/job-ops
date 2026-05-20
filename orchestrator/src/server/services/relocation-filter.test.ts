import { describe, expect, it } from "vitest";

import {
  type RelocationFilterConfig,
  requiresRelocation,
} from "./relocation-filter";

/**
 * The relocation filter is **multi-tenant**: it has no module-scope
 * constants about any particular user.  Every test passes an explicit
 * config.  The two profiles below are illustrative — one matches the
 * production "Munich-based EU candidate" today, the other proves the
 * predicate inverts cleanly for a totally different candidate.
 *
 * If a future change re-introduces hardcoded user data into the filter
 * module, the Tokyo profile test breaks instantly because the predicate
 * starts ignoring the config.  See CLAUDE.md → "Mandatory: Multi-User
 * First Design".
 */

const MUNICH_PROFILE: RelocationFilterConfig = {
  homeCities: [
    "munich",
    "münchen",
    "muenchen",
    "garching",
    "gräfelfing",
    "graefelfing",
    "unterföhring",
    "unterfoehring",
    "kirchheim",
    "germering",
    "aschheim",
    "ottobrunn",
    "planegg",
    "martinsried",
    "neubiberg",
    "haar",
    "ismaning",
    "oberhaching",
    "vaterstetten",
    "putzbrunn",
    "pullach",
    "taufkirchen",
  ],
  accessibleRegions: [
    "germany",
    "deutschland",
    "de",
    "netherlands",
    "holland",
    "nl",
    "europe",
    "european union",
    "european",
    "eu",
    "emea",
    "worldwide",
    "anywhere",
    "global",
    "distributed",
    "austria",
    "belgium",
    "bulgaria",
    "croatia",
    "cyprus",
    "czech",
    "czechia",
    "denmark",
    "estonia",
    "finland",
    "france",
    "greece",
    "hungary",
    "italy",
    "latvia",
    "lithuania",
    "luxembourg",
    "malta",
    "poland",
    "portugal",
    "romania",
    "slovakia",
    "slovenia",
    "spain",
    "sweden",
    "switzerland",
    "norway",
    "iceland",
  ],
};

const TOKYO_PROFILE: RelocationFilterConfig = {
  homeCities: ["tokyo", "東京"],
  accessibleRegions: [
    "japan",
    "asia pacific",
    "asia-pacific",
    "apac",
    "worldwide",
    "anywhere",
    "global",
  ],
};

describe("requiresRelocation — Munich profile", () => {
  it("keeps Munich and its suburbs regardless of remote flag", () => {
    expect(
      requiresRelocation({ location: "Munich, Germany" }, MUNICH_PROFILE),
    ).toBe(false);
    expect(
      requiresRelocation({ location: "München, BY, DE" }, MUNICH_PROFILE),
    ).toBe(false);
    expect(
      requiresRelocation({ location: "Garching bei München" }, MUNICH_PROFILE),
    ).toBe(false);
    expect(
      requiresRelocation(
        { location: "Ottobrunn", isRemote: false },
        MUNICH_PROFILE,
      ),
    ).toBe(false);
  });

  it("keeps EU country-only locations only when the role is flagged remote", () => {
    expect(
      requiresRelocation(
        { location: "Germany", isRemote: true },
        MUNICH_PROFILE,
      ),
    ).toBe(false);
    expect(
      requiresRelocation({ location: "DE", isRemote: true }, MUNICH_PROFILE),
    ).toBe(false);
    expect(
      requiresRelocation(
        { location: "Netherlands", isRemote: true },
        MUNICH_PROFILE,
      ),
    ).toBe(false);

    expect(
      requiresRelocation(
        { location: "Germany", isRemote: false },
        MUNICH_PROFILE,
      ),
    ).toBe(true);
    expect(
      requiresRelocation(
        { location: "Canada", isRemote: null },
        MUNICH_PROFILE,
      ),
    ).toBe(true);
    expect(
      requiresRelocation({ location: "United Kingdom" }, MUNICH_PROFILE),
    ).toBe(true);
    // Even with isRemote=true, a non-accessible country-only string is
    // treated as relocation (US-residents-only remote).
    expect(
      requiresRelocation(
        { location: "United States", isRemote: true },
        MUNICH_PROFILE,
      ),
    ).toBe(true);
    expect(
      requiresRelocation(
        { location: "Canada", isRemote: true },
        MUNICH_PROFILE,
      ),
    ).toBe(true);
  });

  it("flags region-locked remote even when the string contains 'Remote'", () => {
    const cases = [
      "Remote - US",
      "Remote, US",
      "Remote-US",
      "Remote-US/CA",
      "US Remote",
      "Remote USA",
      "Remote - United States",
      "United States - Remote Opportunity",
      "Remote - Canada",
      "Canada - Remote Opportunity",
      "Remote, India",
      "India - Remote",
      "Remote - Japan",
      "Remote, Japan, APAC",
      "Remote - Singapore",
      "Remote - Australia",
      "Remote - Brazil",
      "Remote - Mexico",
      "Remote, Colombia",
      "Remote, Pennsylvania, United States, AMER",
      "Remote - Ireland",
      "Remote - United Kingdom",
      "REMOTE (US-Based Preferred)",
      "REMOTE (CANADA)",
      "Denver, CO;San Francisco, CA;New York, NY;Toronto, Ontario, CAN - Remote",
    ];
    for (const location of cases) {
      expect(
        requiresRelocation({ location }, MUNICH_PROFILE),
        `${location} should be relocation under Munich profile`,
      ).toBe(true);
    }
  });

  it("keeps EU-accessible remote postings (Germany / NL / EMEA / EU / Europe present)", () => {
    const cases = [
      "Remote, Germany",
      "Remote - Germany",
      "Remote, Netherlands",
      "Remote, EMEA",
      "Remote, EU",
      "Remote, Europe",
      "Remote - Spain",
      "Remote - Poland",
      // Mixed multi-region listings keep if at least one region is accessible.
      "Remote, Germany; Remote, Ireland; Remote, Netherlands; Remote, United Kingdom",
      "Remote, EMEA; Remote, Germany; Remote, US",
      "Remote, France, EMEA",
    ];
    for (const location of cases) {
      expect(
        requiresRelocation({ location }, MUNICH_PROFILE),
        `${location} should be kept under Munich profile`,
      ).toBe(false);
    }
  });

  it("keeps generic remote markers with no region qualifier", () => {
    expect(requiresRelocation({ location: "Remote" }, MUNICH_PROFILE)).toBe(
      false,
    );
    expect(
      requiresRelocation(
        { location: "Anywhere in the World" },
        MUNICH_PROFILE,
      ),
    ).toBe(false);
    expect(requiresRelocation({ location: "Worldwide" }, MUNICH_PROFILE)).toBe(
      false,
    );
    expect(
      requiresRelocation({ location: "Fully Remote" }, MUNICH_PROFILE),
    ).toBe(false);
    expect(
      requiresRelocation({ location: "Home Office" }, MUNICH_PROFILE),
    ).toBe(false);
  });

  it("does not let short codes match inside unrelated words", () => {
    // "us" must not match inside "houston" / "denmark"; "uk" must not match
    // inside "ukraine".  Both Denmark (accessible) and Ukraine (atlas, not
    // accessible) are tested separately.
    expect(
      requiresRelocation({ location: "Remote, Denmark" }, MUNICH_PROFILE),
    ).toBe(false);
    // Ukraine is in the atlas but NOT in Munich-profile accessible list →
    // region-locked remote → relocation.  If the user wants to include
    // Ukraine, they add it to relocationAccessibleRegions.
    expect(
      requiresRelocation({ location: "Remote, Ukraine" }, MUNICH_PROFILE),
    ).toBe(true);
  });

  it("flags city-level non-Munich locations as relocation", () => {
    expect(
      requiresRelocation(
        { location: "Berlin, Germany", isRemote: false },
        MUNICH_PROFILE,
      ),
    ).toBe(true);
    expect(
      requiresRelocation(
        {
          location: "San Francisco, CA, United States",
          isRemote: true,
        },
        MUNICH_PROFILE,
      ),
    ).toBe(true);
    expect(
      requiresRelocation(
        { location: "Dubai, United Arab Emirates" },
        MUNICH_PROFILE,
      ),
    ).toBe(true);
  });

  it("treats empty location as unknown (no filter)", () => {
    expect(requiresRelocation({ location: null }, MUNICH_PROFILE)).toBe(false);
    expect(requiresRelocation({ location: "" }, MUNICH_PROFILE)).toBe(false);
    expect(requiresRelocation({}, MUNICH_PROFILE)).toBe(false);
  });

  it("flags hybrid roles outside home regardless of isRemote", () => {
    expect(
      requiresRelocation(
        {
          location: "Berlin, Germany",
          isRemote: true,
          workFromHomeType: "hybrid",
        },
        MUNICH_PROFILE,
      ),
    ).toBe(true);
    expect(
      requiresRelocation(
        {
          location: "Germany",
          isRemote: true,
          workFromHomeType: "hybrid",
        },
        MUNICH_PROFILE,
      ),
    ).toBe(true);
    expect(
      requiresRelocation(
        {
          location: "Munich, Germany",
          isRemote: false,
          workFromHomeType: "hybrid",
        },
        MUNICH_PROFILE,
      ),
    ).toBe(false);
    expect(
      requiresRelocation(
        { location: "Remote, EU", workFromHomeType: "hybrid" },
        MUNICH_PROFILE,
      ),
    ).toBe(false);
  });
});

describe("requiresRelocation — Tokyo profile (multi-tenant proof)", () => {
  // These tests prove the predicate's behaviour is fully driven by the
  // config — flipping homeCities + accessibleRegions inverts the decisions.

  it("keeps Tokyo + APAC remote, drops Remote-Germany", () => {
    expect(
      requiresRelocation({ location: "Tokyo, Japan" }, TOKYO_PROFILE),
    ).toBe(false);
    expect(
      requiresRelocation({ location: "Remote, Japan" }, TOKYO_PROFILE),
    ).toBe(false);
    expect(requiresRelocation({ location: "Remote, APAC" }, TOKYO_PROFILE)).toBe(
      false,
    );

    // Symmetric: what's accessible for Munich is non-accessible for Tokyo.
    expect(
      requiresRelocation({ location: "Remote, Germany" }, TOKYO_PROFILE),
    ).toBe(true);
    expect(
      requiresRelocation({ location: "Remote - US" }, TOKYO_PROFILE),
    ).toBe(true);
    expect(
      requiresRelocation({ location: "Munich, Germany" }, TOKYO_PROFILE),
    ).toBe(true);
  });

  it("keeps generic Remote / Worldwide regardless of profile", () => {
    expect(requiresRelocation({ location: "Remote" }, TOKYO_PROFILE)).toBe(
      false,
    );
    expect(requiresRelocation({ location: "Worldwide" }, TOKYO_PROFILE)).toBe(
      false,
    );
    expect(
      requiresRelocation({ location: "Anywhere in the World" }, TOKYO_PROFILE),
    ).toBe(false);
  });

  it("country-only Japan keeps when remote, Germany drops", () => {
    expect(
      requiresRelocation(
        { location: "Japan", isRemote: true },
        TOKYO_PROFILE,
      ),
    ).toBe(false);
    expect(
      requiresRelocation(
        { location: "Germany", isRemote: true },
        TOKYO_PROFILE,
      ),
    ).toBe(true);
  });
});

describe("requiresRelocation — degenerate configs", () => {
  it("with empty accessibleRegions, any region-tagged remote drops; bare 'Remote' kept", () => {
    const NO_REGION: RelocationFilterConfig = {
      homeCities: ["munich"],
      accessibleRegions: [],
    };
    expect(requiresRelocation({ location: "Remote" }, NO_REGION)).toBe(false);
    expect(
      requiresRelocation({ location: "Remote, Germany" }, NO_REGION),
    ).toBe(true);
    expect(requiresRelocation({ location: "Munich" }, NO_REGION)).toBe(false);
  });

  it("with empty homeCities, no city is auto-allowed", () => {
    const NO_HOME: RelocationFilterConfig = {
      homeCities: [],
      accessibleRegions: ["germany"],
    };
    // Munich without homeCities falls through to city-level → relocation.
    expect(
      requiresRelocation(
        { location: "Munich, Germany", isRemote: false },
        NO_HOME,
      ),
    ).toBe(true);
    // But "Germany" + remote still keeps because it's accessible.
    expect(
      requiresRelocation(
        { location: "Germany", isRemote: true },
        NO_HOME,
      ),
    ).toBe(false);
  });
});

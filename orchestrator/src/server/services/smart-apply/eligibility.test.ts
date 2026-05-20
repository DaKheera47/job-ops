import { describe, expect, it } from "vitest";
import {
  evaluateSmartApplyEligibility,
  isSmartApplyEligible,
} from "./eligibility";
import type { JobApplicabilityContext } from "./types";

/**
 * Smart Apply opens a real headed browser at the candidate's behalf, parses
 * a form, and pre-fills it from the design resume.  The list of allowed
 * ATSes is intentionally tiny — adding one without a parser would mean
 * opening a form we cannot fill safely.
 *
 * These tests pin:
 *   • only `greenhouse` + `ashby` are eligible (every other source must be
 *     explicitly added),
 *   • URL-based detection works even when the source field disagrees (so
 *     an apply link that lives on a Greenhouse board but came from a
 *     LinkedIn crawl is still picked up),
 *   • the verdict honours both `applicationLink` and `jobUrl` fall-back
 *     so existing job rows with the URL in either field keep working.
 */

function ctx(job: Partial<JobApplicabilityContext["job"]>): JobApplicabilityContext {
  return {
    job: {
      id: job.id ?? "test-id",
      source: (job.source ?? "manual") as JobApplicabilityContext["job"]["source"],
      applicationLink: job.applicationLink ?? null,
      jobUrl: job.jobUrl ?? "",
    },
  };
}

describe("evaluateSmartApplyEligibility", () => {
  it("admits Greenhouse jobs by source", () => {
    const v = evaluateSmartApplyEligibility(
      ctx({
        source: "greenhouse",
        applicationLink: "https://boards.greenhouse.io/acme/jobs/1",
      }),
    );
    expect(v.eligible).toBe(true);
    if (v.eligible) {
      expect(v.ats).toBe("greenhouse");
      expect(v.applyUrl).toContain("greenhouse.io");
    }
  });

  it("admits Ashby jobs by source", () => {
    const v = evaluateSmartApplyEligibility(
      ctx({
        source: "ashby",
        applicationLink: "https://jobs.ashbyhq.com/acme/abc",
      }),
    );
    expect(v.eligible).toBe(true);
    if (v.eligible) {
      expect(v.ats).toBe("ashby");
    }
  });

  it("admits via URL even when the source field disagrees", () => {
    // LinkedIn crawl whose apply link is actually a Greenhouse board.
    const v1 = evaluateSmartApplyEligibility(
      ctx({
        source: "linkedin",
        applicationLink: "https://job-boards.greenhouse.io/acme/jobs/42",
      }),
    );
    expect(v1.eligible).toBe(true);
    if (v1.eligible) expect(v1.ats).toBe("greenhouse");

    // Same idea for Ashby.
    const v2 = evaluateSmartApplyEligibility(
      ctx({
        source: "indeed",
        applicationLink: "https://jobs.ashbyhq.com/acme/abc",
      }),
    );
    expect(v2.eligible).toBe(true);
    if (v2.eligible) expect(v2.ats).toBe("ashby");
  });

  it("falls back to jobUrl when applicationLink is missing", () => {
    const v = evaluateSmartApplyEligibility(
      ctx({
        source: "greenhouse",
        applicationLink: null,
        jobUrl: "https://boards.greenhouse.io/acme/jobs/1",
      }),
    );
    expect(v.eligible).toBe(true);
    if (v.eligible) expect(v.applyUrl).toContain("greenhouse.io");
  });

  it.each([
    ["linkedin", "https://www.linkedin.com/jobs/view/123"],
    ["indeed", "https://www.indeed.com/viewjob?jk=x"],
    ["manual", "https://acme.com/careers/123"],
    ["workday", "https://acme.wd1.myworkdayjobs.com/Acme/123"],
    ["lever", "https://jobs.lever.co/acme/123"],
  ])("rejects unsupported source %s with explicit reason", (source, url) => {
    const v = evaluateSmartApplyEligibility(
      ctx({ source: source as any, applicationLink: url }),
    );
    expect(v.eligible).toBe(false);
    if (!v.eligible) {
      expect(v.reason).toMatch(/not (yet )?supported/i);
    }
  });

  it("rejects when no apply URL is available", () => {
    const v = evaluateSmartApplyEligibility(
      ctx({ source: "greenhouse", applicationLink: null, jobUrl: "" }),
    );
    expect(v.eligible).toBe(false);
    if (!v.eligible) expect(v.reason).toMatch(/no apply url/i);
  });

  it("rejects when only whitespace is provided", () => {
    const v = evaluateSmartApplyEligibility(
      ctx({ source: "greenhouse", applicationLink: "   ", jobUrl: "   " }),
    );
    expect(v.eligible).toBe(false);
  });
});

describe("isSmartApplyEligible", () => {
  it("returns true when the full verdict is eligible", () => {
    expect(
      isSmartApplyEligible(
        ctx({
          source: "greenhouse",
          applicationLink: "https://boards.greenhouse.io/acme/jobs/1",
        }),
      ),
    ).toBe(true);
  });

  it("returns false when the source is unsupported", () => {
    expect(
      isSmartApplyEligible(
        ctx({
          source: "linkedin",
          applicationLink: "https://www.linkedin.com/jobs/view/1",
        }),
      ),
    ).toBe(false);
  });
});

import type { Job } from "@shared/types";
import { describe, expect, it } from "vitest";
import { assessJobLegitimacy } from "./ghost-job-detector";

/**
 * The ghost-job detector is a heuristic surfaced to the user as 🟢/🟡/🔴
 * tier on every job card.  Tests pin tier-level outcomes (not exact
 * scores) so that adjusting an individual signal weight does not turn
 * the test red — only a structural change to the heuristic does.
 */

const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

function makeJob(overrides: Partial<Job>): Job {
  // Defaults are intentionally neutral so each test only varies the field
  // it is exercising.  Date/age fields default to "recent" so they don't
  // pollute unrelated assertions.
  return {
    id: "job-1",
    source: "manual" as Job["source"],
    sourceJobId: null,
    jobUrlDirect: null,
    datePosted: daysAgo(1),
    title: "Senior Engineer",
    employer: "Acme",
    employerUrl: "https://acme.com",
    jobUrl: "https://acme.com/jobs/1",
    applicationLink: "https://acme.com/jobs/1/apply",
    disciplines: null,
    deadline: null,
    salary: "$120k–$160k",
    location: "Remote",
    locationEvidence: null,
    degreeRequired: null,
    starting: null,
    jobDescription:
      "We are hiring a senior engineer to join our distributed team. " +
      "You will report to the hiring manager and partner with our team. " +
      "Our stack is Rust, TypeScript, Postgres. The interview process " +
      "consists of a screen, a technical interview and an onsite. " +
      "We use modern tooling and ship to production daily. " +
      "Looking for someone with strong backend engineering experience " +
      "and a track record of shipping production systems.",
    status: "discovered",
    outcome: null,
    closedAt: null,
    suitabilityScore: null,
    suitabilityReason: null,
    matchAnalysis: null,
    legitimacyTier: null,
    legitimacyScore: null,
    legitimacySignals: null,
    tailoredSummary: null,
    tailoredHeadline: null,
    tailoredSkills: null,
    selectedProjectIds: null,
    pdfPath: null,
    coverLetterText: null,
    coverLetterPdfPath: null,
    tracerLinksEnabled: false,
    sponsorMatchScore: null,
    sponsorMatchNames: null,
    jobType: null,
    salarySource: null,
    salaryInterval: null,
    salaryMinAmount: null,
    salaryMaxAmount: null,
    salaryCurrency: null,
    isRemote: true,
    jobLevel: null,
    jobFunction: null,
    listingType: null,
    emails: null,
    companyIndustry: null,
    companyLogo: null,
    companyUrlDirect: null,
    companyAddresses: null,
    companyNumEmployees: null,
    companyRevenue: null,
    companyDescription: null,
    skills: null,
    experienceRange: null,
    companyRating: null,
    companyReviewsCount: null,
    vacancyCount: null,
    workFromHomeType: null,
    discoveredAt: new Date().toISOString(),
    processedAt: null,
    readyAt: null,
    appliedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Job;
}

function signalCodes(job: Job): string[] {
  return assessJobLegitimacy(job).signals.map((s) => s.code);
}

describe("assessJobLegitimacy", () => {
  it("classifies a detailed, fresh, process-rich posting as green", () => {
    const result = assessJobLegitimacy(makeJob({}));
    expect(result.tier).toBe("green");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("flags an empty description with no_description and a low tier", () => {
    const result = assessJobLegitimacy(
      makeJob({ jobDescription: "" }),
    );
    expect(result.signals.map((s) => s.code)).toContain("no_description");
    expect(result.tier).not.toBe("green");
  });

  it("flags a very short description", () => {
    const result = assessJobLegitimacy(
      makeJob({
        jobDescription: "We are hiring. Apply now if interested.",
      }),
    );
    expect(result.signals.map((s) => s.code)).toContain(
      "very_short_description",
    );
  });

  it("flags a stale posting (>=90 days)", () => {
    const codes = signalCodes(
      makeJob({ datePosted: daysAgo(120) }),
    );
    expect(codes).toContain("stale_posting");
  });

  it("flags an aged posting (45–89 days) without escalating to stale", () => {
    const codes = signalCodes(
      makeJob({ datePosted: daysAgo(60) }),
    );
    expect(codes).toContain("aged_posting");
    expect(codes).not.toContain("stale_posting");
  });

  it("flags evergreen wording", () => {
    const codes = signalCodes(
      makeJob({
        jobDescription:
          "We are always hiring engineers. " +
          "This is an evergreen position with no deadline. " +
          "We process applications on a rolling basis.",
      }),
    );
    expect(codes).toContain("evergreen_language");
  });

  it("flags vague hype when several markers co-occur", () => {
    const codes = signalCodes(
      makeJob({
        jobDescription:
          "Looking for a rockstar ninja who can wear many hats in " +
          "a fast-paced environment. Self-starter required.",
      }),
    );
    expect(codes).toContain("vague_hype");
  });

  it("flags a past application deadline and applies a heavy penalty", () => {
    const result = assessJobLegitimacy(
      makeJob({ deadline: daysAgo(7) }),
    );
    expect(result.signals.map((s) => s.code)).toContain("deadline_passed");
    expect(result.tier).not.toBe("green");
  });

  it("flags missing company URL", () => {
    const codes = signalCodes(
      makeJob({ employerUrl: null, companyUrlDirect: null }),
    );
    expect(codes).toContain("no_company_url");
  });

  it("clamps the score to [0, 100] even on a worst-case combination", () => {
    const result = assessJobLegitimacy(
      makeJob({
        jobDescription: "",
        datePosted: daysAgo(180),
        deadline: daysAgo(10),
        employerUrl: null,
        companyUrlDirect: null,
        salary: null,
        location: null,
        isRemote: true,
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns a tier consistent with the score band", () => {
    // Sanity check on the tier function — protects against accidentally
    // swapping green/yellow/red thresholds.
    const green = assessJobLegitimacy(makeJob({}));
    expect(["green", "yellow", "red"]).toContain(green.tier);
    expect(green.tier).toBe("green");

    const red = assessJobLegitimacy(
      makeJob({
        jobDescription: "",
        datePosted: daysAgo(120),
        deadline: daysAgo(10),
      }),
    );
    expect(red.tier === "red" || red.tier === "yellow").toBe(true);
    expect(red.score).toBeLessThan(green.score);
  });
});

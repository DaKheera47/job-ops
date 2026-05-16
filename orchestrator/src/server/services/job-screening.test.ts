import { describe, expect, it } from "vitest";

import {
  ANTI_DOMAIN_NAMES,
  formatSkipReason,
  screenJob,
  type ResumeKeywords,
} from "./job-screening";

const TPM_KEYWORDS: ResumeKeywords = {
  tokens: new Set([
    "program",
    "manager",
    "technical",
    "pmp",
    "iso",
    "26262",
    "security",
    "sdl",
    "compliance",
    "vulnerability",
    "openssf",
    "c++",
    "cryptography",
    "ci/cd",
    "github",
    "stakeholder",
    "engineering",
    "embedded",
    "intel",
    "qpl",
    "automotive",
    "asil-b",
    "release",
    "pmo",
    "delivery",
  ]),
  sourceLength: 1000,
};

const EMPTY_KEYWORDS: ResumeKeywords = { tokens: new Set(), sourceLength: 0 };

describe("screenJob — anti-domain", () => {
  it.each([
    ["Medical Billing Specialist", "healthcare"],
    ["Senior Clinical Research Associate", "healthcare"],
    ["Pharmaceutical Sales Representative", "healthcare"],
    ["Dental Office Manager", "healthcare"],
    ["Payroll Tax Lead — Remote", "billing_accounting"],
    ["Revenue Cycle Specialist", "billing_accounting"],
    ["Insurance Underwriter", "insurance"],
    ["Field Sales Executive — Hyperscaler", "field_sales"],
    ["SDR — Outbound Pipeline", "field_sales"],
    ["SAP S/4HANA Consultant", "erp_consultant"],
    ["Oracle EBS Consultant", "erp_consultant"],
    ["Real Estate Loan Officer", "real_estate"],
    ["Paralegal — Corporate Litigation", "legal"],
    ["Line Cook (Full Time)", "retail_service"],
    ["Talent Acquisition Partner", "recruiting"],
    ["Senior Graphic Designer", "creative_arts"],
    ["Personal Trainer / Fitness Coach", "fitness_wellness"],
  ])("flags %j as %s", (title, expectedDomain) => {
    const result = screenJob({ title }, TPM_KEYWORDS);
    expect(result.skip).toBe(true);
    if (result.skip) {
      expect(result.reason.kind).toBe("anti_domain");
      expect((result.reason as { domain: string }).domain).toBe(expectedDomain);
    }
  });

  it("does not flag tech-aligned roles that happen to share generic words", () => {
    // "Controller" alone could be billing, but our pattern requires the
    // billing/accounting context; a firmware Controller role must pass.
    const r1 = screenJob(
      {
        title: "Senior Firmware Engineer — Memory Controller",
        jobDescription: "C++ embedded engineering",
      },
      TPM_KEYWORDS,
    );
    expect(r1.skip).toBe(false);

    // "Account Manager" generic in tech context (Customer Success) — current
    // pattern is conservative and only flags SDR/BDR/Account Executive.
    const r2 = screenJob(
      {
        title: "Technical Account Manager",
        jobDescription: "Program management for enterprise customers",
      },
      TPM_KEYWORDS,
    );
    expect(r2.skip).toBe(false);
  });
});

describe("screenJob — resume signal", () => {
  it("keeps a job whose title overlaps even one resume keyword", () => {
    const result = screenJob(
      { title: "Senior Program Manager", jobDescription: "" },
      TPM_KEYWORDS,
    );
    expect(result.skip).toBe(false);
  });

  it("keeps a job whose description overlaps even one resume keyword", () => {
    const result = screenJob(
      {
        title: "Software Reliability Lead",
        jobDescription:
          "Drive embedded firmware delivery, CI/CD ownership, security mindset.",
      },
      TPM_KEYWORDS,
    );
    expect(result.skip).toBe(false);
  });

  it("skips a generic-sounding role that shares zero resume keywords", () => {
    const result = screenJob(
      {
        title: "Junior Quantitative Researcher",
        jobDescription:
          "Statistical analysis of equity markets, options pricing models, MATLAB.",
      },
      TPM_KEYWORDS,
    );
    expect(result.skip).toBe(true);
    if (result.skip) expect(result.reason.kind).toBe("no_resume_signal");
  });

  it("skips on empty title + description", () => {
    const result = screenJob(
      { title: "Marketing Coordinator", jobDescription: null },
      TPM_KEYWORDS,
    );
    expect(result.skip).toBe(true);
  });

  it("does NOT filter when the resume has no keywords (no signal to compare)", () => {
    const result = screenJob(
      {
        title: "Some unrelated role",
        jobDescription: "Unrelated description",
      },
      EMPTY_KEYWORDS,
    );
    expect(result.skip).toBe(false);
  });
});

describe("screenJob — ordering", () => {
  it("anti-domain wins over resume-signal match (medical PM is still healthcare)", () => {
    // Title says "Program Manager" (resume match) but also "Medical Billing"
    // (anti-domain) — the candidate doesn't want this regardless of overlap.
    const result = screenJob(
      {
        title: "Medical Billing Program Manager",
        jobDescription: "Lead program management for medical billing platform.",
      },
      TPM_KEYWORDS,
    );
    expect(result.skip).toBe(true);
    if (result.skip) expect(result.reason.kind).toBe("anti_domain");
  });
});

describe("formatSkipReason", () => {
  it("returns a human-readable string per reason kind", () => {
    expect(
      formatSkipReason({ kind: "anti_domain", domain: "healthcare" }),
    ).toMatch(/healthcare/i);
    expect(formatSkipReason({ kind: "no_resume_signal" })).toMatch(
      /keyword overlap/i,
    );
  });
});

describe("ANTI_DOMAIN_NAMES export", () => {
  it("lists each pattern exactly once", () => {
    expect(new Set(ANTI_DOMAIN_NAMES).size).toBe(ANTI_DOMAIN_NAMES.length);
    expect(ANTI_DOMAIN_NAMES).toContain("healthcare");
    expect(ANTI_DOMAIN_NAMES).toContain("field_sales");
  });
});

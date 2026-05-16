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
  candidateLanguages: new Set(["english", "russian"]),
  sourceLength: 1000,
};

const EMPTY_KEYWORDS: ResumeKeywords = {
  tokens: new Set(),
  candidateLanguages: new Set(),
  sourceLength: 0,
};

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

describe("screenJob — language gate", () => {
  it("skips jobs that hard-require a language the candidate doesn't list", () => {
    const r1 = screenJob(
      {
        title: "Senior Program Manager",
        jobDescription:
          "We're looking for a Native Polish speaker to lead our Warsaw team.",
      },
      TPM_KEYWORDS,
    );
    expect(r1.skip).toBe(true);
    if (r1.skip) {
      expect(r1.reason.kind).toBe("language_required");
      if (r1.reason.kind === "language_required") {
        expect(r1.reason.language).toBe("polish");
      }
    }

    const r2 = screenJob(
      {
        title: "Project Manager",
        jobDescription: "Fluent in German is mandatory for this role.",
      },
      TPM_KEYWORDS,
    );
    expect(r2.skip).toBe(true);
    if (r2.skip && r2.reason.kind === "language_required") {
      expect(r2.reason.language).toBe("german");
    }

    const r3 = screenJob(
      {
        title: "Engineering Manager",
        jobDescription: "Must speak French at a professional level.",
      },
      TPM_KEYWORDS,
    );
    expect(r3.skip).toBe(true);
  });

  it("does NOT skip when the language is in candidate's resume", () => {
    // Russian IS in TPM_KEYWORDS.candidateLanguages — must pass even with
    // a hard requirement.
    const r = screenJob(
      {
        title: "Technical Program Manager",
        jobDescription: "Native Russian speaker required for client comms.",
      },
      TPM_KEYWORDS,
    );
    expect(r.skip).toBe(false);
  });

  it("does NOT skip on soft mentions ('knowledge of X is a plus')", () => {
    const r = screenJob(
      {
        title: "Senior Program Manager",
        jobDescription:
          "Knowledge of Polish or German is a plus but not required.",
      },
      TPM_KEYWORDS,
    );
    expect(r.skip).toBe(false);
  });

  it("does NOT skip when candidateLanguages is empty (no negative signal)", () => {
    const noLangs: ResumeKeywords = {
      tokens: TPM_KEYWORDS.tokens,
      candidateLanguages: new Set(),
      sourceLength: TPM_KEYWORDS.sourceLength,
    };
    const r = screenJob(
      {
        title: "Program Manager",
        jobDescription: "Native Polish speaker required.",
      },
      noLangs,
    );
    expect(r.skip).toBe(false);
  });

  it("anti-domain still wins over language gate", () => {
    const r = screenJob(
      {
        title: "Medical Billing Specialist",
        jobDescription: "Native Polish speaker required.",
      },
      TPM_KEYWORDS,
    );
    expect(r.skip).toBe(true);
    if (r.skip) expect(r.reason.kind).toBe("anti_domain");
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

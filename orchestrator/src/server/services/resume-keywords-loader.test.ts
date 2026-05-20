import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The resume-keywords-loader drives two of the three pre-scoring screening
 * gates (language gate, resume-signal gate).  Its `degraded` + `degradationReason`
 * fields are the source of the "⚠️ Heads up: screening ran in degraded mode"
 * banner in the Telegram run summary.
 *
 * If those flags silently turn `false` when the loader fails / the design
 * resume is missing, the user is left thinking screening is healthy when
 * it's running with only anti-domain.  These tests pin that contract.
 */

vi.mock("../repositories/design-resume", () => ({
  getLatestDesignResumeDocument: vi.fn(),
}));

describe.sequential("resume-keywords-loader", () => {
  let mod: typeof import("./resume-keywords-loader");
  let designResumeRepo: typeof import("../repositories/design-resume");

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("../repositories/design-resume", () => ({
      getLatestDesignResumeDocument: vi.fn(),
    }));
    designResumeRepo = await import("../repositories/design-resume");
    mod = await import("./resume-keywords-loader");
    mod.clearResumeKeywordsCache();
  });

  afterEach(() => {
    vi.doUnmock("../repositories/design-resume");
  });

  it("marks degraded with resume_load_error when the repo throws", async () => {
    vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockRejectedValue(
      new Error("boom"),
    );

    const result = await mod.getResumeKeywords();
    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toBe("resume_load_error");
    expect(result.keywords.tokens.size).toBe(0);
    expect(result.keywords.candidateLanguages.size).toBe(0);
  });

  it("marks degraded with no_design_resume when no document exists", async () => {
    vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockResolvedValue(
      null as any,
    );

    const result = await mod.getResumeKeywords();
    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toBe("no_design_resume");
    expect(result.keywords.tokens.size).toBe(0);
  });

  it("marks degraded with empty_resume when the document parses to zero tokens", async () => {
    vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockResolvedValue({
      resumeJson: {
        basics: { name: "Jane Doe" },
        sections: {},
      },
    } as any);

    const result = await mod.getResumeKeywords();
    expect(result.degraded).toBe(true);
    expect(result.degradationReason).toBe("empty_resume");
  });

  it("returns healthy + keywords for a real-looking resume", async () => {
    vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockResolvedValue({
      resumeJson: {
        basics: { name: "Jane Doe", headline: "Backend Engineer" },
        sections: {
          skills: {
            items: [
              { name: "Backend", keywords: ["Python", "PostgreSQL"] },
              { name: "Infrastructure", keywords: ["Kubernetes", "Terraform"] },
            ],
          },
          experience: {
            items: [
              {
                position: "Senior Engineer",
                summary: "Built distributed systems for an analytics platform.",
              },
            ],
          },
          languages: {
            items: [{ language: "English" }, { language: "Spanish" }],
          },
        },
      },
    } as any);

    const result = await mod.getResumeKeywords();
    expect(result.degraded).toBe(false);
    expect(result.degradationReason).toBeNull();
    expect(result.keywords.tokens.size).toBeGreaterThan(0);
    // Languages picked up from the languages section.
    expect(result.keywords.candidateLanguages.has("english")).toBe(true);
    expect(result.keywords.candidateLanguages.has("spanish")).toBe(true);
  });

  it("works for a completely different candidate profile (multi-tenant smoke)", async () => {
    // Multi-user invariant: the loader must not "know" about any particular
    // candidate.  Swap the resume to a totally different person — different
    // industry, different language set, different name — and the loader
    // must still produce a non-degraded result with that profile's tokens
    // and that profile's languages.  If a future change accidentally pins
    // any token / language to the production user, this test catches it.
    vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockResolvedValue({
      resumeJson: {
        basics: { name: "Akira Tanaka", headline: "UX Researcher" },
        sections: {
          skills: {
            items: [
              { name: "Research", keywords: ["ethnography", "interviewing"] },
              { name: "Tools", keywords: ["Figma", "Dovetail"] },
            ],
          },
          experience: {
            items: [
              {
                position: "Lead UX Researcher",
                summary: "Ran longitudinal studies for a consumer app.",
              },
            ],
          },
          languages: {
            items: [{ language: "Japanese" }, { language: "Mandarin" }],
          },
        },
      },
    } as any);

    const result = await mod.getResumeKeywords();
    expect(result.degraded).toBe(false);
    // Tokens reflect the new candidate's resume, not the previous one.
    expect(result.keywords.tokens.has("research")).toBe(true);
    expect(result.keywords.tokens.has("figma")).toBe(true);
    // Languages reflect the new candidate's resume.
    expect(result.keywords.candidateLanguages.has("japanese")).toBe(true);
    expect(result.keywords.candidateLanguages.has("mandarin")).toBe(true);
    // Importantly: previous candidate's tokens / languages MUST NOT leak.
    expect(result.keywords.candidateLanguages.has("english")).toBe(false);
    expect(result.keywords.candidateLanguages.has("spanish")).toBe(false);
  });

  it("caches the result across calls and refreshes after clearResumeKeywordsCache()", async () => {
    vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockResolvedValue({
      resumeJson: {
        basics: { name: "Jane Doe" },
        sections: {
          skills: {
            items: [{ name: "Backend", keywords: ["Python"] }],
          },
        },
      },
    } as any);

    const a = await mod.getResumeKeywords();
    const b = await mod.getResumeKeywords();
    expect(a).toBe(b);
    expect(
      vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mock.calls.length,
    ).toBe(1);

    mod.clearResumeKeywordsCache();
    await mod.getResumeKeywords();
    expect(
      vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mock.calls.length,
    ).toBe(2);
  });
});

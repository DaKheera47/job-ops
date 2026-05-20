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
        basics: { name: "Olga" },
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
        basics: { name: "Olga", headline: "Technical Program Manager" },
        sections: {
          skills: {
            items: [
              { name: "Program Management", keywords: ["PMP", "Agile"] },
              { name: "Security", keywords: ["SDL", "OpenSSF"] },
            ],
          },
          experience: {
            items: [
              {
                position: "Senior PM",
                summary: "Delivered CI/CD security reviews at Intel.",
              },
            ],
          },
          languages: {
            items: [{ language: "English" }, { language: "Russian" }],
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
    expect(result.keywords.candidateLanguages.has("russian")).toBe(true);
  });

  it("caches the result across calls and refreshes after clearResumeKeywordsCache()", async () => {
    vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockResolvedValue({
      resumeJson: {
        basics: { name: "Olga" },
        sections: {
          skills: {
            items: [{ name: "Program", keywords: ["PMP"] }],
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

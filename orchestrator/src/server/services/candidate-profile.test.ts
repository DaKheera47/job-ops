import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Candidate identity is sourced ONLY from the design resume the user
 * uploaded at registration.  Anything that prints the candidate's name,
 * email, phone or location (PDF filenames, Smart Apply prefill, cover
 * letter sender block, Telegram captions) must go through this helper —
 * never `ctx.from.first_name`, env vars, or hard-coded strings.
 *
 * These tests pin:
 *   • the "single source of truth" invariant (basics fields surface, others
 *     are ignored),
 *   • the empty / missing / malformed fall-through (returns null rather
 *     than throwing or leaking placeholder strings),
 *   • the 60-second cache + cache invalidation,
 *   • the name-part splitter used by filename / Smart Apply pre-fillers.
 */

vi.mock("../repositories/design-resume", () => ({
  getLatestDesignResumeDocument: vi.fn(),
}));

describe.sequential("candidate-profile", () => {
  let mod: typeof import("./candidate-profile");
  let designResumeRepo: typeof import("../repositories/design-resume");

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Re-mock after resetModules so the import below picks up the mock.
    vi.doMock("../repositories/design-resume", () => ({
      getLatestDesignResumeDocument: vi.fn(),
    }));
    designResumeRepo = await import("../repositories/design-resume");
    mod = await import("./candidate-profile");
    mod.clearCandidateBasicsCache();
  });

  afterEach(() => {
    vi.doUnmock("../repositories/design-resume");
  });

  function setDoc(resumeJson: unknown): void {
    vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockResolvedValue({
      resumeJson,
    } as any);
  }

  describe("getCandidateBasics", () => {
    it("returns empty when no design-resume document exists", async () => {
      vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockResolvedValue(
        null as any,
      );

      const basics = await mod.getCandidateBasics();
      expect(basics).toEqual({
        name: null,
        email: null,
        phone: null,
        location: null,
        headline: null,
      });
    });

    it("returns empty when document has no basics object", async () => {
      setDoc({ summary: { content: "hi" } });
      const basics = await mod.getCandidateBasics();
      expect(basics.name).toBeNull();
      expect(basics.email).toBeNull();
    });

    it("returns empty when basics is not an object", async () => {
      setDoc({ basics: "Olga Fadeeva" });
      const basics = await mod.getCandidateBasics();
      expect(basics.name).toBeNull();
    });

    it("surfaces all five basics fields from the resume", async () => {
      setDoc({
        basics: {
          name: "Jane Doe",
          email: "jane@example.com",
          phone: "+1 555 0100",
          location: "Helsinki, Finland",
          headline: "Backend Engineer",
        },
      });

      const basics = await mod.getCandidateBasics();
      expect(basics).toEqual({
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "+1 555 0100",
        location: "Helsinki, Finland",
        headline: "Backend Engineer",
      });
    });

    it("trims whitespace and treats empty strings as null", async () => {
      setDoc({
        basics: {
          name: "  Jane  ",
          email: "",
          phone: "   ",
          location: "Helsinki",
          headline: null,
        },
      });

      const basics = await mod.getCandidateBasics();
      expect(basics.name).toBe("Jane");
      expect(basics.email).toBeNull();
      expect(basics.phone).toBeNull();
      expect(basics.location).toBe("Helsinki");
      expect(basics.headline).toBeNull();
    });

    it("ignores non-string fields without throwing", async () => {
      setDoc({
        basics: {
          name: 42,
          email: { nested: "x" },
          phone: ["+1"],
        },
      });

      const basics = await mod.getCandidateBasics();
      expect(basics.name).toBeNull();
      expect(basics.email).toBeNull();
      expect(basics.phone).toBeNull();
    });

    it("falls through to empty when the repo throws (never crashes the caller)", async () => {
      vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mockRejectedValue(
        new Error("DB exploded"),
      );

      const basics = await mod.getCandidateBasics();
      expect(basics.name).toBeNull();
    });
  });

  describe("cache", () => {
    it("only reads the repo once for two calls within TTL", async () => {
      setDoc({ basics: { name: "Jane" } });

      const first = await mod.getCandidateBasics();
      const second = await mod.getCandidateBasics();

      expect(first).toEqual(second);
      expect(
        vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mock.calls
          .length,
      ).toBe(1);
    });

    it("re-reads the repo after clearCandidateBasicsCache()", async () => {
      setDoc({ basics: { name: "Jane" } });

      await mod.getCandidateBasics();
      mod.clearCandidateBasicsCache();

      // Change the underlying data — the next call must reflect it.
      setDoc({ basics: { name: "Jane Doe" } });
      const after = await mod.getCandidateBasics();

      expect(after.name).toBe("Jane Doe");
      expect(
        vi.mocked(designResumeRepo.getLatestDesignResumeDocument).mock.calls
          .length,
      ).toBe(2);
    });
  });

  describe("getCandidateNameParts", () => {
    it("splits a typical two-word name", async () => {
      setDoc({ basics: { name: "Jane Doe" } });
      const parts = await mod.getCandidateNameParts();
      expect(parts).toEqual({
        firstName: "Jane",
        lastName: "Doe",
        fullName: "Jane Doe",
      });
    });

    it("treats a single token as first name with null last name", async () => {
      setDoc({ basics: { name: "Jane" } });
      const parts = await mod.getCandidateNameParts();
      expect(parts.firstName).toBe("Jane");
      expect(parts.lastName).toBeNull();
      expect(parts.fullName).toBe("Jane");
    });

    it("treats the last token as last name for multi-part names", async () => {
      setDoc({ basics: { name: "Maria del Carmen García" } });
      const parts = await mod.getCandidateNameParts();
      expect(parts.lastName).toBe("García");
      expect(parts.firstName).toBe("Maria del Carmen");
    });

    it("returns all-null when the resume has no name", async () => {
      setDoc({ basics: { headline: "Engineer" } });
      const parts = await mod.getCandidateNameParts();
      expect(parts.firstName).toBeNull();
      expect(parts.lastName).toBeNull();
      expect(parts.fullName).toBeNull();
    });

    it("handles extra whitespace inside the name", async () => {
      setDoc({ basics: { name: "Jane    Doe" } });
      const parts = await mod.getCandidateNameParts();
      expect(parts.firstName).toBe("Jane");
      expect(parts.lastName).toBe("Doe");
    });

    it("handles a non-Latin script name end-to-end (multi-tenant smoke)", async () => {
      // Multi-user smoke: the splitter must not assume Latin glyphs.
      setDoc({ basics: { name: "山田 太郎" } });
      const parts = await mod.getCandidateNameParts();
      expect(parts.firstName).toBe("山田");
      expect(parts.lastName).toBe("太郎");
      expect(parts.fullName).toBe("山田 太郎");
    });
  });
});

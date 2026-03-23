import type { AppError } from "@infra/errors";
import { createJob } from "@shared/testing/factories";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildJobChatPromptContext } from "./ghostwriter-context";

vi.mock("../repositories/jobs", () => ({
  getJobById: vi.fn(),
}));

vi.mock("../repositories/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("./profile", () => ({
  getProfile: vi.fn(),
}));

vi.mock("./writing-style", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./writing-style")>();

  return {
    ...actual,
    getWritingStyle: vi.fn(),
  };
});

import { getJobById } from "../repositories/jobs";
import { getSetting } from "../repositories/settings";
import { getProfile } from "./profile";
import { getWritingStyle } from "./writing-style";

describe("buildJobChatPromptContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSetting).mockResolvedValue(null);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "professional",
      formality: "medium",
      constraints: "",
      doNotUse: "",
      languageMode: "manual",
      manualLanguage: "english",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
  });

  it("builds context with style directives and snapshots", async () => {
    const job = createJob({
      id: "job-ctx-1",
      title: "Software Engineer",
      employer: "JP Morgan",
      jobDescription: "A".repeat(5000),
    });

    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "direct",
      formality: "high",
      constraints: "Keep responses under 120 words",
      doNotUse: "synergy, leverage",
      languageMode: "manual",
      manualLanguage: "german",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        name: "Test User",
        headline: "Full-stack engineer",
        summary: "I build production systems",
      },
      sections: {
        skills: {
          name: "Skills",
          visible: true,
          id: "skills-1",
          items: [
            {
              id: "skill-1",
              visible: true,
              name: "TypeScript",
              description: "",
              level: 4,
              keywords: ["Node.js", "React"],
            },
          ],
        },
      },
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.style).toEqual({
      tone: "direct",
      formality: "high",
      constraints: "Keep responses under 120 words",
      doNotUse: "synergy, leverage",
      languageMode: "manual",
      manualLanguage: "german",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
    expect(context.systemPrompt).toContain("Writing style tone: direct.");
    expect(context.systemPrompt).toContain("Writing style formality: high.");
    expect(context.systemPrompt).toContain(
      "Follow the user's requested output language exactly when they specify one.",
    );
    expect(context.systemPrompt).toContain(
      "When the user does not request a language, default to writing user-visible resume or application content in German.",
    );
    expect(context.systemPrompt).toContain(
      "When suggesting a headline or job title, preserve the original wording instead of translating it.",
    );
    expect(context.systemPrompt).toContain(
      "Writing constraints: Keep responses under 120 words",
    );
    expect(context.systemPrompt).toContain(
      "Avoid these terms: synergy, leverage",
    );
    expect(context.jobSnapshot).toContain('"id": "job-ctx-1"');
    expect(context.jobSnapshot.length).toBeLessThan(6000);
    expect(context.profileSnapshot).toContain("Name: Test User");
    expect(context.profileSnapshot).toContain("Skills:");
  });

  it("falls back to empty profile snapshot when profile loading fails", async () => {
    const job = createJob({ id: "job-ctx-2" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockRejectedValue(new Error("profile unavailable"));

    const context = await buildJobChatPromptContext(job.id);

    expect(context.job.id).toBe("job-ctx-2");
    expect(context.profileSnapshot).toContain("Name: Unknown");
    expect(context.systemPrompt).toContain("Writing style tone: professional.");
  });

  it("matches Ghostwriter language to detected resume language when configured", async () => {
    const job = createJob({ id: "job-ctx-3" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "professional",
      formality: "medium",
      constraints: "",
      doNotUse: "",
      languageMode: "match-resume",
      manualLanguage: "english",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        name: "Claire",
        summary:
          "Je conçois des plateformes de données et je travaille avec des équipes produit et ingénierie.",
      },
      sections: {
        summary: {
          content:
            "Expérience en développement, livraison et accompagnement des équipes.",
        },
      },
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.systemPrompt).toContain(
      "When the user does not request a language, default to writing user-visible resume or application content in French.",
    );
  });

  it("removes language instructions from global writing constraints", async () => {
    const job = createJob({ id: "job-ctx-4" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "professional",
      formality: "medium",
      constraints: "Always respond in French. Keep responses under 120 words.",
      doNotUse: "",
      languageMode: "manual",
      manualLanguage: "english",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
    vi.mocked(getProfile).mockResolvedValue({});

    const context = await buildJobChatPromptContext(job.id);

    expect(context.systemPrompt).toContain(
      "When the user does not request a language, default to writing user-visible resume or application content in English.",
    );
    expect(context.systemPrompt).toContain(
      "Writing constraints: Keep responses under 120 words",
    );
    expect(context.systemPrompt).not.toContain("Always respond in French");
  });

  it("uses a stored Ghostwriter prompt template override", async () => {
    const job = createJob({ id: "job-ctx-5" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(getSetting).mockImplementation(async (key) =>
      key === "ghostwriterSystemPromptTemplate"
        ? "Custom Ghostwriter {{tone}} {{unknownToken}}"
        : null,
    );

    const context = await buildJobChatPromptContext(job.id);

    expect(context.systemPrompt).toContain("Custom Ghostwriter professional");
    expect(context.systemPrompt).toContain("{{unknownToken}}");
  });

  it("throws not found for unknown job", async () => {
    vi.mocked(getJobById).mockResolvedValue(null);

    await expect(
      buildJobChatPromptContext("missing-job"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    } satisfies Partial<AppError>);
  });
});

import { createJob } from "@shared/testing/factories";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "../infra/errors";
import { buildJobChatPromptContext } from "./ghostwriter-context";

vi.mock("../repositories/jobs", () => ({
  getJobById: vi.fn(),
}));

vi.mock("../repositories/settings", () => ({
  getAllSettings: vi.fn(),
}));

vi.mock("./profile", () => ({
  getProfile: vi.fn(),
}));

vi.mock("./settings-conversion", () => ({
  resolveSettingValue: vi.fn(),
}));

import { getJobById } from "../repositories/jobs";
import { getAllSettings } from "../repositories/settings";
import { getProfile } from "./profile";
import { resolveSettingValue } from "./settings-conversion";

describe("buildJobChatPromptContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAllSettings).mockResolvedValue({});
    vi.mocked(resolveSettingValue).mockImplementation((key, override) => {
      const fallback: Record<string, string> = {
        chatStyleTone: "professional",
        chatStyleFormality: "medium",
        chatStyleConstraints: "",
        chatStyleDoNotUse: "",
      };
      return { value: override ?? fallback[key as string] ?? "" } as any;
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
    vi.mocked(getAllSettings).mockResolvedValue({
      chatStyleTone: "direct",
      chatStyleFormality: "high",
      chatStyleConstraints: "Keep responses under 120 words",
      chatStyleDoNotUse: "synergy, leverage",
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
    });
    expect(context.systemPrompt).toContain("Writing style tone: direct.");
    expect(context.systemPrompt).toContain("Writing style formality: high.");
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

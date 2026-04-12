import type { ResumeProfile } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const callJsonMock = vi.fn();

vi.mock("./llm/service", () => ({
  LlmService: class {
    callJson = callJsonMock;
  },
}));

vi.mock("@server/services/modelSelection", () => ({
  resolveLlmModel: vi.fn().mockResolvedValue("test-model"),
}));

vi.mock("./profile", () => ({
  getProfile: vi.fn(),
}));

import {
  buildFallbackSearchTerms,
  suggestOnboardingSearchTerms,
} from "./onboarding-search-terms";
import { getProfile } from "./profile";

describe("suggestOnboardingSearchTerms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns sanitized AI terms when generation succeeds", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        headline: "Senior Backend Engineer",
        summary: "Builds APIs and platform systems.",
      },
      sections: {
        experience: {
          items: [
            {
              id: "exp-1",
              company: "Example",
              position: "Platform Engineer",
              location: "Remote",
              date: "2024",
              summary: "Built services",
              visible: true,
            },
          ],
        },
      },
    } satisfies ResumeProfile);
    callJsonMock.mockResolvedValue({
      success: true,
      data: {
        terms: [
          " Senior Backend Engineer ",
          "Platform Engineer",
          "platform engineer",
          "",
        ],
      },
    });

    const result = await suggestOnboardingSearchTerms();

    expect(result).toEqual({
      terms: ["Senior Backend Engineer", "Platform Engineer"],
      source: "ai",
    });
  });

  it("falls back to headline and visible experience titles when AI generation fails", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        headline: "Staff Software Engineer",
      },
      sections: {
        experience: {
          items: [
            {
              id: "exp-1",
              company: "Example",
              position: "Platform Engineer",
              location: "Remote",
              date: "2024",
              summary: "Built services",
              visible: true,
            },
            {
              id: "exp-2",
              company: "Hidden",
              position: "Principal Engineer",
              location: "Remote",
              date: "2023",
              summary: "Hidden role",
              visible: false,
            },
          ],
        },
      },
    } satisfies ResumeProfile);
    callJsonMock.mockResolvedValue({
      success: false,
      error: "LLM provider unavailable",
    });

    const result = await suggestOnboardingSearchTerms();

    expect(result).toEqual({
      terms: ["Staff Software Engineer", "Platform Engineer"],
      source: "fallback",
    });
  });

  it("falls back to project and skill context when no headline or visible positions exist", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        summary: "Backend platform engineer focused on distributed systems.",
      },
      sections: {
        experience: {
          items: [
            {
              id: "exp-1",
              company: "Hidden",
              position: "Principal Engineer",
              location: "Remote",
              date: "2023",
              summary: "Hidden role",
              visible: false,
            },
          ],
        },
        projects: {
          items: [
            {
              id: "proj-1",
              name: "Developer Platform",
              description: "Internal platform tooling",
              date: "2024",
              summary: "Platform project",
              keywords: ["Platform Engineer", "Internal tooling"],
              visible: true,
            },
          ],
        },
        skills: {
          items: [
            {
              id: "skill-1",
              name: "Site Reliability Engineering",
              description: "Reliability and production operations",
              level: 5,
              keywords: ["Distributed Systems"],
              visible: true,
            },
          ],
        },
      },
    } satisfies ResumeProfile);
    callJsonMock.mockResolvedValue({
      success: false,
      error: "LLM provider unavailable",
    });

    const result = await suggestOnboardingSearchTerms();

    expect(result).toEqual({
      terms: [
        "Developer Platform",
        "Site Reliability Engineering",
        "Platform Engineer",
        "Internal tooling",
        "Distributed Systems",
        "Backend platform engineer focused on distributed systems.",
      ],
      source: "fallback",
    });
  });

  it("throws a conflict when no usable resume profile exists", async () => {
    vi.mocked(getProfile).mockResolvedValue({
      basics: {},
      sections: {},
    } satisfies ResumeProfile);

    await expect(suggestOnboardingSearchTerms()).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Resume must be configured before suggesting search terms.",
    });
  });

  it("caps and deduplicates fallback search terms", () => {
    const profile: ResumeProfile = {
      basics: {
        headline: "Senior Engineer",
      },
      sections: {
        experience: {
          items: Array.from({ length: 12 }, (_, index) => ({
            id: `exp-${index}`,
            company: "Example",
            position: `Platform Engineer ${index}`,
            location: "Remote",
            date: "2024",
            summary: "Built services",
            visible: true,
          })),
        },
      },
    };

    const result = buildFallbackSearchTerms(profile);

    expect(result.source).toBe("fallback");
    expect(result.terms).toHaveLength(10);
    expect(result.terms[0]).toBe("Senior Engineer");
    expect(result.terms).not.toContain("Platform Engineer 10");
  });
});

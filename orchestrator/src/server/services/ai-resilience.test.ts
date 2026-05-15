import { createJob } from "@shared/testing/factories";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as settingsRepo from "../repositories/settings";
import { pickProjectIdsForJob } from "./projectSelection";
import { scoreJobSuitability } from "./scorer";

// --- Mocks ---
vi.mock("../repositories/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
  getAllSettings: vi.fn().mockResolvedValue({}),
}));

// We need to mock 'fetch' globally for these tests
const globalFetch = global.fetch;

const mockJob = createJob({
  id: "test-job",
  source: "gradcracker",
  title: "Senior Engineer",
  employer: "Test Corp",
  jobDescription: "Looking for a TypeScript and React expert.",
  status: "discovered",
  suitabilityScore: null,
  suitabilityReason: null,
});

const mockProfile = { name: "Test User" };

describe("AI Service Resilience", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    delete process.env.LLM_API_KEY;
    process.env.OPENROUTER_API_KEY = "mock-key"; // Ensure logic tries to call API
    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      llmProvider: "openrouter",
      llmApiKey: "mock-key",
    });
  });

  afterEach(() => {
    global.fetch = globalFetch;
    delete process.env.LLM_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    vi.restoreAllMocks();
  });

  describe("scoreJobSuitability (Scorer)", () => {
    it("should return parsed score when API returns valid JSON", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ score: 85, reason: "Great match" }),
              },
            },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const result = await scoreJobSuitability(mockJob, mockProfile);

      expect(result.score).toBe(85);
      expect(result.reason).toBe("Great match");
    });

    it("should throw LlmNotConfiguredError if API Key is missing", async () => {
      delete process.env.OPENROUTER_API_KEY;
      vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({});

      // Should NOT call fetch
      await expect(scoreJobSuitability(mockJob, mockProfile)).rejects.toThrow(
        "LLM API key not configured",
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should throw LlmNotConfiguredError on API 500/400 errors", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      await expect(scoreJobSuitability(mockJob, mockProfile)).rejects.toThrow(
        "AI scoring failed",
      );
    });

    it("should throw LlmNotConfiguredError on Malformed/Invalid JSON in API response", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: "This is not JSON at all, just text." } },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      await expect(scoreJobSuitability(mockJob, mockProfile)).rejects.toThrow(
        "AI scoring failed",
      );
    });

    it("should extract JSON from markdown code blocks", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  'Here is the score: ```json\n{ "score": 90, "reason": "Good" }\n```',
              },
            },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const result = await scoreJobSuitability(mockJob, mockProfile);
      expect(result.score).toBe(90);
    });
  });

  describe("pickProjectIdsForJob (Project Selection)", () => {
    const mockProjects = [
      {
        id: "p1",
        name: "React App",
        description: "Used React",
        date: "2022",
        summaryText: "React stuff",
        isVisibleInBase: true,
      },
      {
        id: "p2",
        name: "Python Script",
        description: "Used Python",
        date: "2023",
        summaryText: "Python stuff",
        isVisibleInBase: true,
      },
    ];

    it("should return projects selected by AI", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ selectedProjectIds: ["p1"] }),
              },
            },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const result = await pickProjectIdsForJob({
        jobDescription: "React dev",
        eligibleProjects: mockProjects,
        desiredCount: 1,
      });

      expect(result).toEqual(["p1"]);
    });

    it("should fallback if API fails", async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

      const result = await pickProjectIdsForJob({
        jobDescription: "React dev", // Should match p1 due to keyword 'React'
        eligibleProjects: mockProjects,
        desiredCount: 1,
      });

      // It should fall back to keyword matching
      // p1 has 'React', p2 has 'Python'. 'React dev' matches p1.
      expect(result).toEqual(["p1"]);
    });

    it("should fallback if AI returns garbage", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "No valid JSON here" } }],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const result = await pickProjectIdsForJob({
        jobDescription: "Python dev", // Should match p2
        eligibleProjects: mockProjects,
        desiredCount: 1,
      });

      expect(result).toEqual(["p2"]);
    });

    it("should validate returned IDs exist in eligible list", async () => {
      // AI returns an ID that doesn't exist ('p999')
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ selectedProjectIds: ["p999", "p1"] }),
              },
            },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

      const result = await pickProjectIdsForJob({
        jobDescription: "stuff",
        eligibleProjects: mockProjects,
        desiredCount: 2,
      });

      // Should strip p999 and only return p1
      expect(result).toEqual(["p1"]);
    });
  });
});

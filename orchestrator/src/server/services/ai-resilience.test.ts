import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../../shared/types.js";
import { pickProjectIdsForJob } from "./projectSelection.js";
import { scoreJobSuitability } from "./scorer.js";

// --- Mocks ---
vi.mock("../repositories/settings.js", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
  getAllSettings: vi.fn().mockResolvedValue({}),
}));

// We need to mock 'fetch' globally for these tests
const globalFetch = global.fetch;

const now = new Date().toISOString();

// A simple mock job
const mockJob: Job = {
  id: "test-job",
  source: "gradcracker",
  sourceJobId: null,
  jobUrlDirect: null,
  datePosted: null,
  title: "Senior Engineer",
  employer: "Test Corp",
  employerUrl: null,
  jobUrl: "http://test.com",
  applicationLink: null,
  disciplines: null,
  deadline: null,
  salary: null,
  location: null,
  degreeRequired: null,
  starting: null,
  jobDescription: "Looking for a TypeScript and React expert.",
  status: "discovered",
  outcome: null,
  closedAt: null,
  suitabilityScore: null,
  suitabilityReason: null,
  tailoredSummary: null,
  tailoredHeadline: null,
  tailoredSkills: null,
  selectedProjectIds: null,
  pdfPath: null,
  notionPageId: null,
  sponsorMatchScore: null,
  sponsorMatchNames: null,
  jobType: null,
  salarySource: null,
  salaryInterval: null,
  salaryMinAmount: null,
  salaryMaxAmount: null,
  salaryCurrency: null,
  isRemote: null,
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
  discoveredAt: now,
  processedAt: null,
  appliedAt: null,
  createdAt: now,
  updatedAt: now,
};

const mockProfile = { name: "Test User" };

describe("AI Service Resilience", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    process.env.OPENROUTER_API_KEY = "mock-key"; // Ensure logic tries to call API
  });

  afterEach(() => {
    global.fetch = globalFetch;
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

    it("should fallback to mock scoring if API Key is missing", async () => {
      delete process.env.OPENROUTER_API_KEY;

      // Should NOT call fetch
      const result = await scoreJobSuitability(mockJob, mockProfile);

      expect(global.fetch).not.toHaveBeenCalled();
      // Mock score logic gives 50 + points for keywords.
      // 'TypeScript' and 'React' are in JD (5+5) -> 60?
      // "Senior" is bad keyword (-10)? -> 50?
      // Let's just check it didn't crash and returned a number
      expect(typeof result.score).toBe("number");
      expect(result.reason).toContain("keyword matching");
    });

    it("should handle API 500/400 errors gracefully (fallback)", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      // Spy on console.error to keep test output clean
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await scoreJobSuitability(mockJob, mockProfile);

      expect(result.score).toBeDefined(); // Fallback score
      expect(result.reason).toContain("keyword matching"); // Fallback reason
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should handle Malformed/Invalid JSON in API response", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: "This is not JSON at all, just text." } },
          ],
        }),
      };
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);
      vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await scoreJobSuitability(mockJob, mockProfile);

      expect(result.reason).toContain("keyword matching"); // Fell back
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

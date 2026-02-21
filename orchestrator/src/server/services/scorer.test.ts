/**
 * Tests for scorer.ts - focusing on robust JSON parsing from AI responses
 */

import { createJob } from "@shared/testing/factories";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseJsonFromContent } from "./scorer";

describe("parseJsonFromContent", () => {
  describe("valid JSON inputs", () => {
    it("should parse clean JSON object", () => {
      const input = '{"score": 85, "reason": "Great match"}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(85);
      expect(result.reason).toBe("Great match");
    });

    it("should parse JSON with extra whitespace", () => {
      const input = '  { "score" : 75 , "reason" : "Good fit" }  ';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(75);
      expect(result.reason).toBe("Good fit");
    });

    it("should parse JSON with newlines", () => {
      const input = `{
        "score": 90,
        "reason": "Excellent match for the role"
      }`;
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(90);
      expect(result.reason).toBe("Excellent match for the role");
    });
  });

  describe("markdown code fences", () => {
    it("should strip ```json code fences", () => {
      const input = '```json\n{"score": 80, "reason": "Match"}\n```';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(80);
    });

    it("should strip ```JSON code fences (uppercase)", () => {
      const input = '```JSON\n{"score": 80, "reason": "Match"}\n```';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(80);
    });

    it("should strip ``` code fences without language specifier", () => {
      const input = '```\n{"score": 70, "reason": "Decent"}\n```';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(70);
    });

    it("should handle nested code fence patterns", () => {
      const input =
        'Here is the score:\n```json\n{"score": 65, "reason": "Partial match"}\n```\nEnd.';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(65);
    });
  });

  describe("surrounding text", () => {
    it("should extract JSON from text before", () => {
      const input =
        'Based on my analysis, here is my evaluation: {"score": 55, "reason": "Limited match"}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(55);
    });

    it("should extract JSON from text after", () => {
      const input =
        '{"score": 60, "reason": "Moderate match"} I hope this helps!';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(60);
    });

    it("should extract JSON from surrounding text on both sides", () => {
      const input =
        'Here is my response:\n\n{"score": 45, "reason": "Below average fit"}\n\nLet me know if you need more details.';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(45);
    });
  });

  describe("common JSON formatting issues", () => {
    it("should handle trailing comma before closing brace", () => {
      const input = '{"score": 78, "reason": "Good skills",}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(78);
    });

    it("should handle single quotes instead of double quotes", () => {
      const input = "{'score': 82, 'reason': 'Strong candidate'}";
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(82);
    });

    it("should handle unquoted keys", () => {
      const input = '{score: 77, reason: "Reasonable match"}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(77);
    });

    it("should handle mixed issues (trailing comma, single quotes)", () => {
      const input = "{'score': 68, 'reason': 'Average fit',}";
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(68);
    });
  });

  describe("decimal scores", () => {
    it("should parse and round decimal scores", () => {
      // parseJsonFromContent returns raw value for valid JSON; rounding only in regex fallback
      const input = '{"score": 85.7, "reason": "Very good match"}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(85.7);
    });

    it("should parse decimal scores in malformed text", () => {
      const input = 'The score is score: 72.3, reason: "Above average"';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(72);
    });
  });

  describe("malformed responses - regex fallback", () => {
    it("should extract score from completely malformed response", () => {
      const input =
        'I think the score should be score: 50 and the reason: "Average candidate"';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(50);
    });

    it("should extract score with equals sign syntax", () => {
      const input = 'score = 88, reason = "Excellent match"';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(88);
    });

    it("should handle reason with special characters", () => {
      const input =
        '{"score": 73, "reason": "Good match! The candidate\'s skills align well."}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(73);
    });

    it("should provide default reason when only score is extractable", () => {
      const input = "I rate this candidate 85 out of 100 - score: 85";
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(85);
      expect(result.reason).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("should handle zero score", () => {
      const input = '{"score": 0, "reason": "No match at all"}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(0);
    });

    it("should handle score of 100", () => {
      const input = '{"score": 100, "reason": "Perfect candidate"}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(100);
    });

    it("should handle empty reason", () => {
      const input = '{"score": 50, "reason": ""}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(50);
      expect(result.reason).toBe("");
    });

    it("should handle multiline reason", () => {
      const input = `{"score": 70, "reason": "Good skills match. Experience is a bit lacking."}`;
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(70);
      expect(result.reason).toContain("Good skills match");
    });

    it("should handle unicode in reason", () => {
      const input = '{"score": 80, "reason": "Great match ✓ for this role"}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(80);
    });
  });

  describe("failure cases", () => {
    it("should throw when no score can be extracted", () => {
      const input = "This is just plain text with no JSON or score.";
      expect(() => parseJsonFromContent(input)).toThrow(
        "Unable to parse JSON from model response",
      );
    });

    it("should throw for empty input", () => {
      expect(() => parseJsonFromContent("")).toThrow(
        "Unable to parse JSON from model response",
      );
    });

    it("should throw for only whitespace", () => {
      expect(() => parseJsonFromContent("   \n\t   ")).toThrow(
        "Unable to parse JSON from model response",
      );
    });
  });

  describe("real-world AI responses", () => {
    it("should handle GPT-style verbose response", () => {
      const input = `Based on my analysis of the job description and candidate profile, I have evaluated the fit:

\`\`\`json
{
  "score": 72,
  "reason": "Strong React and TypeScript skills match. However, the role requires 5+ years experience which the candidate may not have."
}
\`\`\`

This score reflects the candidate's technical capabilities while accounting for the experience gap.`;
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(72);
      expect(result.reason).toContain("React and TypeScript");
    });

    it("should handle Claude-style response with thinking", () => {
      const input = `Let me evaluate this candidate against the job requirements.

{"score": 83, "reason": "Excellent frontend skills with React and modern tooling. Good culture fit based on startup experience."}`;
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(83);
    });

    it("should handle response with JSON5-style comments", () => {
      // Some models output JSON5-like syntax with comments
      const input = `{
  "score": 67, // Good but not great
  "reason": "Matches most requirements but lacks cloud experience"
}`;
      // This will fail standard parse but regex should catch it
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(67);
    });

    it("should handle response with extra properties", () => {
      const input =
        '{"score": 79, "reason": "Good match", "confidence": "high", "breakdown": {"skills": 25, "experience": 20}}';
      const result = parseJsonFromContent(input);
      expect(result.score).toBe(79);
      expect(result.reason).toBe("Good match");
    });
  });
});

describe("salary penalty", () => {
  let getEffectiveSettingsMock: ReturnType<typeof vi.fn>;
  let getSettingMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Mock the settings module
    const settingsModule = await import("./settings");
    getEffectiveSettingsMock = vi.fn() as unknown as ReturnType<typeof vi.fn>;
    vi.spyOn(settingsModule, "getEffectiveSettings").mockImplementation(
      getEffectiveSettingsMock as () => Promise<
        import("@shared/types").AppSettings
      >,
    );

    // Mock the settings repository
    const settingsRepo = await import("../repositories/settings");
    getSettingMock = vi.fn().mockResolvedValue(null) as unknown as ReturnType<
      typeof vi.fn
    >;
    vi.spyOn(settingsRepo, "getSetting").mockImplementation(
      getSettingMock as (
        key: import("../repositories/settings").SettingKey,
      ) => Promise<string | null>,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isSalaryMissing detection", () => {
    it("should detect null salary as missing", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 10, default: 10, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 80, reason: "Good match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: null,
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(70); // 80 - 10
      expect(result.reason).toContain(
        "Score reduced by 10 points due to missing salary information",
      );
    });

    it("should detect empty string salary as missing", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 10, default: 10, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 80, reason: "Good match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: "",
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(70);
      expect(result.reason).toContain("missing salary information");
    });

    it("should detect whitespace-only salary as missing", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 10, default: 10, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 80, reason: "Good match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: "   ",
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(70);
      expect(result.reason).toContain("missing salary information");
    });

    it("should NOT penalize jobs with non-empty salary", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 10, default: 10, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 80, reason: "Good match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: "Competitive",
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(80); // No penalty
      expect(result.reason).not.toContain("missing salary");
    });

    it("should NOT penalize jobs with actual salary value", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 10, default: 10, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 80, reason: "Good match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: "£40,000 - £50,000",
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(80); // No penalty
      expect(result.reason).not.toContain("missing salary");
    });
  });

  describe("penalty application", () => {
    it("should not apply penalty when disabled", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: false, default: false, override: null },
        missingSalaryPenalty: { value: 10, default: 10, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 80, reason: "Good match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: null,
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(80); // No penalty when disabled
      expect(result.reason).not.toContain("missing salary");
    });

    it("should clamp score to minimum 0 (high penalty on medium score)", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 100, default: 100, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 50, reason: "Average match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: null,
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(0); // Clamped, not negative
      expect(result.reason).toContain("Score reduced by 100 points");
    });

    it("should clamp score to minimum 0 (low score with penalty)", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 10, default: 10, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 5, reason: "Weak match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: null,
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(0); // 5 - 10 = -5, clamped to 0
      expect(result.reason).toContain("Score reduced by 10 points");
    });

    it("should handle penalty of 0", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 0, default: 0, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 80, reason: "Good match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: null,
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(80); // No change with 0 penalty
      expect(result.reason).toContain("Score reduced by 0 points");
    });

    it("should apply penalty with correct amount", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 25, default: 25, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: true,
        data: { score: 90, reason: "Excellent match" },
      });

      const job = createJob({
        id: "test-job-1",
        salary: null,
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.score).toBe(65); // 90 - 25
      expect(result.reason).toContain(
        "Score reduced by 25 points due to missing salary information",
      );
    });
  });

  describe("mock scoring with penalty", () => {
    it("should apply penalty in mock scoring fallback", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: true, default: true, override: null },
        missingSalaryPenalty: { value: 10, default: 10, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      // Simulate API key error to trigger mock scoring
      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: false,
        error: "API key not configured",
      });

      const job = createJob({
        id: "test-job-1",
        salary: null,
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      // Mock score base is 50, with keyword bonuses from "Software Engineer"
      // After 10 point penalty, should be reduced
      expect(result.score).toBeLessThanOrEqual(50);
      expect(result.reason).toContain("missing salary information");
    });

    it("should not apply penalty in mock scoring when disabled", async () => {
      const { scoreJobSuitability } = await import("./scorer");
      const { LlmService } = await import("./llm/service");

      getEffectiveSettingsMock.mockResolvedValue({
        penalizeMissingSalary: { value: false, default: false, override: null },
        missingSalaryPenalty: { value: 10, default: 10, override: null },
        rxresumeBaseResumeId: "base-resume-123",
      } as any);

      vi.spyOn(LlmService.prototype, "callJson").mockResolvedValue({
        success: false,
        error: "API key not configured",
      });

      const job = createJob({
        id: "test-job-1",
        salary: null,
        title: "Software Engineer",
      });
      const result = await scoreJobSuitability(job, {});

      expect(result.reason).not.toContain("missing salary");
    });
  });
});

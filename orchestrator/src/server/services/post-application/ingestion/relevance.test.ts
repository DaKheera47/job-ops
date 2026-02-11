import { describe, expect, it } from "vitest";
import {
  classifyByKeywords,
  computeKeywordRelevanceScore,
  computePolicyDecision,
  POST_APPLICATION_RELEVANCE_HIGH_CONFIDENCE_THRESHOLD,
  POST_APPLICATION_RELEVANCE_MIN_THRESHOLD,
} from "./relevance";

describe("post-application keyword relevance", () => {
  it("scores clear application confirmations above high-confidence threshold", () => {
    const score = computeKeywordRelevanceScore({
      from: "Workable <noreply@candidates.workablemail.com>",
      subject: "Thanks for applying to Example Corp - application received",
      snippet:
        "Thank you for your application. We have received your application.",
    });

    expect(score).toBeGreaterThanOrEqual(
      POST_APPLICATION_RELEVANCE_HIGH_CONFIDENCE_THRESHOLD,
    );
  });

  it("scores clear non-job newsletters as not relevant", () => {
    const score = computeKeywordRelevanceScore({
      from: "newsletter@example.com",
      subject: "Weekly newsletter and webinar invitation",
      snippet: "unsubscribe to stop receiving updates",
    });

    expect(score).toBe(0);
  });

  it("classifies common application subject lines", () => {
    expect(
      classifyByKeywords({
        subject: "Thank you for applying",
        snippet: "Your application was received",
      }),
    ).toBe("Application confirmation");

    expect(
      classifyByKeywords({
        subject: "We regret to inform you",
        snippet: "we are not moving forward",
      }),
    ).toBe("Rejection");
  });
});

describe("post-application relevance gating policy", () => {
  it("marks >=95 as relevant and skips LLM", () => {
    expect(computePolicyDecision(95)).toEqual({
      shouldUseLlm: false,
      isRelevant: true,
    });
  });

  it("marks 60-94 as LLM required", () => {
    expect(
      computePolicyDecision(POST_APPLICATION_RELEVANCE_MIN_THRESHOLD),
    ).toEqual({
      shouldUseLlm: true,
      isRelevant: false,
    });
    expect(
      computePolicyDecision(
        POST_APPLICATION_RELEVANCE_HIGH_CONFIDENCE_THRESHOLD - 1,
      ),
    ).toEqual({
      shouldUseLlm: true,
      isRelevant: false,
    });
  });

  it("marks <60 as not relevant without LLM", () => {
    expect(computePolicyDecision(59)).toEqual({
      shouldUseLlm: false,
      isRelevant: false,
    });
  });
});

import { describe, expect, it } from "vitest";
import { getRetryDelayMs, shouldRetryAttempt } from "./retry-policy";

describe("retry-policy", () => {
  it("retries parse errors", () => {
    expect(
      shouldRetryAttempt({ message: "Failed to parse JSON", status: 200 }),
    ).toBe(true);
  });

  it("retries on 429 and 5xx", () => {
    expect(shouldRetryAttempt({ message: "rate limited", status: 429 })).toBe(
      true,
    );
    expect(shouldRetryAttempt({ message: "server error", status: 503 })).toBe(
      true,
    );
  });

  it("retries timeout and fetch failures", () => {
    expect(
      shouldRetryAttempt({ message: "Request timeout occurred", status: 0 }),
    ).toBe(true);
    expect(
      shouldRetryAttempt({ message: "TypeError: fetch failed", status: 0 }),
    ).toBe(true);
  });

  it("does not retry non-retryable 4xx", () => {
    expect(
      shouldRetryAttempt({
        message: "LLM API error: 400 bad request",
        status: 400,
      }),
    ).toBe(false);
  });

  it("preserves backoff multiplier behavior", () => {
    expect(getRetryDelayMs(500, 1)).toBe(500);
    expect(getRetryDelayMs(500, 2)).toBe(1000);
  });
});

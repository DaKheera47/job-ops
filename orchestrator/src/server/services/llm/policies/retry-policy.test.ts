import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRetryDelayMs,
  parseRetryAfterMs,
  shouldRetryAttempt,
} from "./retry-policy";

describe("shouldRetryAttempt", () => {
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
});

describe("getRetryDelayMs", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses exponential backoff with jitter (Math.random mocked to 0.5)", () => {
    // attempt 1: base * 2^0 = 500, jittered = 500 * 0.5 = 250
    expect(getRetryDelayMs(500, 1)).toBe(250);
    // attempt 2: base * 2^1 = 1000, jittered = 1000 * 0.5 = 500
    expect(getRetryDelayMs(500, 2)).toBe(500);
    // attempt 3: base * 2^2 = 2000, jittered = 2000 * 0.5 = 1000
    expect(getRetryDelayMs(500, 3)).toBe(1000);
  });

  it("caps exponential backoff at 60s", () => {
    // attempt 10 would be 500 * 2^9 = 256000, capped to 60000, jittered to 30000
    expect(getRetryDelayMs(500, 10)).toBe(30_000);
  });

  it("layers jittered backoff on top of Retry-After floor", () => {
    // retryAfter = 3000, base * 2^0 = 500, jittered = 250, total = 3250
    expect(getRetryDelayMs(500, 1, 3000)).toBe(3250);
  });

  it("ignores zero or negative Retry-After", () => {
    expect(getRetryDelayMs(500, 1, 0)).toBe(250);
    expect(getRetryDelayMs(500, 1, -100)).toBe(250);
  });

  it("returns at least 1ms", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(getRetryDelayMs(0, 1)).toBeGreaterThanOrEqual(1);
  });
});

describe("parseRetryAfterMs", () => {
  it("parses integer seconds", () => {
    expect(parseRetryAfterMs("5")).toBe(5000);
    expect(parseRetryAfterMs("0")).toBe(0);
  });

  it("parses fractional seconds", () => {
    expect(parseRetryAfterMs("1.5")).toBe(1500);
  });

  it("parses HTTP-date format", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const result = parseRetryAfterMs(future);
    expect(result).toBeGreaterThan(9_000);
    expect(result).toBeLessThanOrEqual(10_000);
  });

  it("returns undefined for missing/empty/garbage values", () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs("")).toBeUndefined();
    expect(parseRetryAfterMs("   ")).toBeUndefined();
    expect(parseRetryAfterMs("not-a-number")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { withRetry } from "../src/retry.js";

describe("withRetry", () => {
  it("throws on maxAttempts < 1", async () => {
    await expect(
      withRetry(() => Promise.resolve(), { maxAttempts: 0 }),
    ).rejects.toThrow("maxAttempts must be >= 1");
  });

  it("throws on negative maxAttempts", async () => {
    await expect(
      withRetry(() => Promise.resolve(), { maxAttempts: -5 }),
    ).rejects.toThrow("maxAttempts must be >= 1");
  });
});

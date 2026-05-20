import { describe, expect, it } from "vitest";
import {
  classifyLlmError,
  LlmNotConfiguredError,
  LlmTransientError,
} from "./llm-errors";

/**
 * Locks the contract of `classifyLlmError` and the two error classes that
 * gate the pipeline-pause vs per-job-skip decision in scorer.ts.
 *
 * The May 2026 regression collapsed both paths into LlmNotConfiguredError
 * — every transient 5xx took the whole pipeline down with a misleading
 * "check your API key" message. These tests pin the distinction.
 */
describe("classifyLlmError", () => {
  it("classifies missing-key / auth errors as config", () => {
    expect(classifyLlmError("LLM API key not configured")).toBe("config");
    expect(classifyLlmError("API key is missing")).toBe("config");
    expect(classifyLlmError("No provider configured")).toBe("config");
    expect(classifyLlmError("401 Unauthorized")).toBe("config");
    expect(classifyLlmError("403 Forbidden")).toBe("config");
    expect(classifyLlmError("Invalid API key")).toBe("config");
    expect(classifyLlmError("authentication failed")).toBe("config");
  });

  it("classifies typical transient failures as transient", () => {
    expect(classifyLlmError("503 Service Unavailable")).toBe("transient");
    expect(classifyLlmError("429 Too Many Requests")).toBe("transient");
    expect(classifyLlmError("ECONNRESET")).toBe("transient");
    expect(classifyLlmError("fetch failed")).toBe("transient");
    expect(classifyLlmError("Unable to parse JSON from model response")).toBe(
      "transient",
    );
    expect(classifyLlmError("All provider modes failed")).toBe("transient");
    expect(classifyLlmError("rate limited by upstream")).toBe("transient");
  });

  it("is case-insensitive", () => {
    expect(classifyLlmError("UNAUTHORIZED")).toBe("config");
    expect(classifyLlmError("invalid Api Key")).toBe("config");
  });
});

describe("LlmTransientError", () => {
  it("preserves the optional cause string for logging", () => {
    const err = new LlmTransientError("AI temporarily unavailable", "503 SUA");
    expect(err.name).toBe("LlmTransientError");
    expect(err.message).toBe("AI temporarily unavailable");
    expect(err.cause).toBe("503 SUA");
  });

  it("is distinguishable from LlmNotConfiguredError via instanceof", () => {
    const transient = new LlmTransientError("transient");
    const config = new LlmNotConfiguredError("config");
    expect(transient instanceof LlmTransientError).toBe(true);
    expect(transient instanceof LlmNotConfiguredError).toBe(false);
    expect(config instanceof LlmNotConfiguredError).toBe(true);
    expect(config instanceof LlmTransientError).toBe(false);
  });
});

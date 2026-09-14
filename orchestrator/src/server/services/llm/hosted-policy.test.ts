import { describe, expect, it } from "vitest";
import { isHostedLocalProvider, isSafeHostedBaseUrl } from "./hosted-policy";

describe("hosted LLM policy", () => {
  it("blocks deployment-local providers", () => {
    expect(isHostedLocalProvider("ollama")).toBe(true);
    expect(isHostedLocalProvider("lm-studio")).toBe(true);
    expect(isHostedLocalProvider("openai")).toBe(false);
  });

  it("allows public HTTPS endpoints and blocks private or non-HTTPS URLs", () => {
    expect(isSafeHostedBaseUrl("https://api.example.com/v1")).toBe(true);
    expect(isSafeHostedBaseUrl("http://localhost:11434")).toBe(false);
    expect(
      isSafeHostedBaseUrl("https://169.254.169.254/latest/meta-data"),
    ).toBe(false);
    expect(isSafeHostedBaseUrl(null)).toBe(true);
  });
});

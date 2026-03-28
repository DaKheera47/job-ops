import { getDefaultPromptTemplate } from "@shared/prompt-template-definitions.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn(),
}));

import { getSetting } from "@server/repositories/settings";
import {
  getEffectivePromptTemplate,
  renderPromptTemplate,
} from "./prompt-templates";

describe("prompt templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSetting).mockResolvedValue(null);
  });

  it("renders known placeholders and leaves unknown placeholders untouched", () => {
    expect(
      renderPromptTemplate("Tone {{tone}} | {{unknownToken}}", {
        tone: "direct",
      }),
    ).toBe("Tone direct | {{unknownToken}}");
  });

  it("returns the shared default template when no override is stored", async () => {
    await expect(
      getEffectivePromptTemplate("ghostwriterSystemPromptTemplate"),
    ).resolves.toBe(
      getDefaultPromptTemplate("ghostwriterSystemPromptTemplate"),
    );
  });

  it("returns the stored template override when present", async () => {
    vi.mocked(getSetting).mockResolvedValue("Custom template {{tone}}");

    await expect(
      getEffectivePromptTemplate("ghostwriterSystemPromptTemplate"),
    ).resolves.toBe("Custom template {{tone}}");
  });
});

import type { ResumeProfile } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const callJsonMock = vi.fn();
const getProviderMock = vi.fn();
const getBaseUrlMock = vi.fn();

vi.mock("../repositories/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("./llm/service", () => ({
  LlmService: class {
    callJson = callJsonMock;
    getProvider = getProviderMock;
    getBaseUrl = getBaseUrlMock;
  },
}));

vi.mock("./writing-style", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./writing-style")>();

  return {
    ...actual,
    getWritingStyle: vi.fn(),
  };
});

import { getSetting } from "../repositories/settings";
import { generateTailoring } from "./summary";
import { getWritingStyle } from "./writing-style";

describe("generateTailoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProviderMock.mockReturnValue("openrouter");
    getBaseUrlMock.mockReturnValue("https://openrouter.ai");
    callJsonMock.mockResolvedValue({
      success: true,
      data: {
        summary: "Tailored summary",
        headline: "Senior Engineer",
        skills: [],
      },
    });
    vi.mocked(getSetting).mockResolvedValue(null);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "friendly",
      formality: "low",
      constraints: "Keep it under 90 words",
      doNotUse: "synergy",
      languageMode: "manual",
      manualLanguage: "german",
    });
  });

  it("passes shared writing-style and language instructions into tailoring prompts", async () => {
    const profile: ResumeProfile = {
      basics: {
        name: "Test User",
        label: "Engineer",
        summary: "Existing summary",
      },
    };

    await generateTailoring("Build APIs", profile);

    expect(callJsonMock).toHaveBeenCalledTimes(1);

    const request = callJsonMock.mock.calls[0]?.[0];
    expect(request?.messages?.[0]?.content).toContain(
      "WRITING STYLE PREFERENCES:",
    );
    expect(request?.messages?.[0]?.content).toContain("Tone: friendly");
    expect(request?.messages?.[0]?.content).toContain("Formality: low");
    expect(request?.messages?.[0]?.content).toContain(
      "Additional constraints: Keep it under 90 words",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Avoid these words or phrases: synergy",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Output language for summary and skills: German",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Do NOT translate, localize, or paraphrase the headline, even if the rest of the output is in German.",
    );
    expect(request?.messages?.[0]?.content).toContain(
      'Keep "headline" in the exact original job-title wording from the JD.',
    );
  });

  it("removes language directives from constraints so explicit language settings win", async () => {
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "friendly",
      formality: "low",
      constraints: "Always respond in French. Keep it under 90 words.",
      doNotUse: "synergy",
      languageMode: "manual",
      manualLanguage: "german",
    });

    await generateTailoring("Build APIs", {
      basics: {
        name: "Test User",
        label: "Engineer",
      },
    });

    const request = callJsonMock.mock.calls.at(-1)?.[0];
    expect(request?.messages?.[0]?.content).toContain(
      "Additional constraints: Keep it under 90 words",
    );
    expect(request?.messages?.[0]?.content).not.toContain(
      "Always respond in French",
    );
    expect(request?.messages?.[0]?.content).toContain(
      "Output language for summary and skills: German",
    );
  });
});

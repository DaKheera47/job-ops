import type { DesignResumeJson } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultReactiveResumeDocument } from "../rxresume/document";

const mocks = vi.hoisted(() => ({
  callJson: vi.fn(),
  resolveLlmModel: vi.fn(),
  createConfiguredLlmService: vi.fn(),
  getWritingStyle: vi.fn(),
}));

vi.mock("../modelSelection", () => ({
  resolveLlmModel: mocks.resolveLlmModel,
  createConfiguredLlmService: mocks.createConfiguredLlmService,
}));

vi.mock("../writing-style", () => ({
  getWritingStyle: mocks.getWritingStyle,
  stripLanguageDirectivesFromConstraints: vi.fn((value: string) => value),
}));

vi.mock("../output-language", () => ({
  resolveWritingOutputLanguage: vi.fn(() => ({ language: "english" })),
  getWritingLanguageLabel: vi.fn(() => "English"),
}));

import { generateDesignResumeFieldSuggestion } from "./ai-field-suggestion";

function makeDocument(): DesignResumeJson {
  const document = buildDefaultReactiveResumeDocument() as DesignResumeJson;
  document.basics.name = "Taylor Quinn";
  document.basics.headline = "Software Engineer";
  document.summary.content = "<p>Builds reliable web systems.</p>";
  return document;
}

describe("generateDesignResumeFieldSuggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLlmModel.mockResolvedValue("test-model");
    mocks.createConfiguredLlmService.mockResolvedValue({
      callJson: mocks.callJson,
    });
    mocks.getWritingStyle.mockResolvedValue({
      tone: "concise",
      formality: "medium",
      constraints: "",
      doNotUse: "",
    });
  });

  it("returns a sanitized plain text suggestion", async () => {
    mocks.callJson.mockResolvedValue({
      success: true,
      data: {
        message: "Sharper headline.",
        suggestion: "<strong>Platform Engineer</strong>",
      },
    });

    const result = await generateDesignResumeFieldSuggestion({
      document: makeDocument(),
      field: {
        path: "basics.headline",
        label: "Headline",
        value: "Software Engineer",
        valueType: "plain_text",
        section: "Basics",
      },
      prompt: "Make it stronger",
    });

    expect(result).toEqual({
      message: "Sharper headline.",
      suggestion: "Platform Engineer",
      valueType: "plain_text",
    });
  });

  it("keeps only resume-safe tags for html suggestions", async () => {
    mocks.callJson.mockResolvedValue({
      success: true,
      data: {
        message: "Added bullets.",
        suggestion:
          '<div onclick="x()"><script>alert(1)</script><ul><li><strong>Led delivery</strong></li></ul></div>',
      },
    });

    const result = await generateDesignResumeFieldSuggestion({
      document: makeDocument(),
      field: {
        path: "summary.content",
        label: "Summary",
        value: "",
        valueType: "html",
        section: "Summary",
      },
      prompt: "Make this punchier",
    });

    expect(result.suggestion).toBe(
      "<ul><li><strong>Led delivery</strong></li></ul>",
    );
  });

  it("normalizes string list suggestions", async () => {
    mocks.callJson.mockResolvedValue({
      success: true,
      data: {
        message: "Focused keywords.",
        suggestion: [" TypeScript ", "React", "TypeScript", ""],
      },
    });

    const result = await generateDesignResumeFieldSuggestion({
      document: makeDocument(),
      field: {
        path: "sections.skills.items.0.keywords",
        label: "Keywords",
        value: ["JavaScript"],
        valueType: "string_list",
        section: "Skills",
        itemLabel: "Frontend",
      },
      prompt: "Use modern frontend terms",
    });

    expect(result.suggestion).toEqual(["TypeScript", "React"]);
  });

  it("maps LLM failures to an upstream error", async () => {
    mocks.callJson.mockResolvedValue({
      success: false,
      error: "LLM API key not configured",
    });

    await expect(
      generateDesignResumeFieldSuggestion({
        document: makeDocument(),
        field: {
          path: "basics.headline",
          label: "Headline",
          value: "",
          valueType: "plain_text",
          section: "Basics",
        },
        prompt: "Draft it",
      }),
    ).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });
});

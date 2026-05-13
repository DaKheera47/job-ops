import { describe, expect, it } from "vitest";
import {
  designResumeAiFieldSuggestionSchema,
  designResumePatchSchema,
} from "./design-resume";

describe("designResumePatchSchema", () => {
  it("rejects patch paths that are not valid JSON pointers", () => {
    const result = designResumePatchSchema.safeParse({
      baseRevision: 1,
      operations: [
        {
          op: "replace",
          path: "basics/name",
          value: "Taylor",
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Patch paths must be valid JSON Pointers.",
    );
  });

  it("requires a value for test operations", () => {
    const result = designResumePatchSchema.safeParse({
      baseRevision: 1,
      operations: [
        {
          op: "test",
          path: "/basics/name",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid AI field suggestion requests", () => {
    const result = designResumeAiFieldSuggestionSchema.safeParse({
      document: { basics: {}, summary: {}, sections: {} },
      field: {
        path: "basics.headline",
        label: "Headline",
        value: "",
        valueType: "plain_text",
        section: "Basics",
      },
      prompt: "Make it stronger",
    });

    expect(result.success).toBe(true);
  });

  it("rejects AI field suggestion requests without a prompt", () => {
    const result = designResumeAiFieldSuggestionSchema.safeParse({
      document: { basics: {}, summary: {}, sections: {} },
      field: {
        path: "basics.headline",
        label: "Headline",
        value: "",
        valueType: "plain_text",
      },
      prompt: "",
    });

    expect(result.success).toBe(false);
  });
});

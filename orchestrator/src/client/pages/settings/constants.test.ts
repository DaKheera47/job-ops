import {
  getMatchingWritingStylePresetId,
  resolveWritingStyleDraft,
} from "./constants";

describe("settings constants", () => {
  it("falls back to effective defaults when overrides are blank", () => {
    expect(
      resolveWritingStyleDraft({
        values: {
          tone: "",
          formality: null,
          constraints: "",
          doNotUse: undefined,
        },
        defaults: {
          tone: { effective: "professional", default: "professional" },
          formality: { effective: "medium", default: "medium" },
          constraints: {
            effective: "Keep it warm",
            default: "Keep it warm",
          },
          doNotUse: { effective: "", default: "" },
        },
      }),
    ).toEqual({
      tone: "professional",
      formality: "medium",
      constraints: "Keep it warm",
      doNotUse: "",
    });
  });

  it("detects matching presets from a resolved draft", () => {
    expect(
      getMatchingWritingStylePresetId({
        tone: "friendly",
        formality: "low",
        constraints: "Keep the response warm, approachable, and confident.",
        doNotUse: "",
      }),
    ).toBe("friendly");

    expect(
      getMatchingWritingStylePresetId({
        tone: "friendly",
        formality: "low",
        constraints: "Custom note",
        doNotUse: "",
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { updateSettingsSchema } from "./settings-schema";

describe("updateSettingsSchema language settings", () => {
  it("accepts supported language mode and manual language values", () => {
    expect(
      updateSettingsSchema.parse({
        chatStyleLanguageMode: "manual",
        chatStyleManualLanguage: "german",
      }),
    ).toEqual({
      chatStyleLanguageMode: "manual",
      chatStyleManualLanguage: "german",
    });

    expect(
      updateSettingsSchema.parse({
        chatStyleLanguageMode: null,
        chatStyleManualLanguage: null,
      }),
    ).toEqual({
      chatStyleLanguageMode: null,
      chatStyleManualLanguage: null,
    });
  });

  it("rejects unsupported language mode and manual language values", () => {
    const result = updateSettingsSchema.safeParse({
      chatStyleLanguageMode: "auto",
      chatStyleManualLanguage: "italian",
    });

    expect(result.success).toBe(false);

    if (result.success) {
      return;
    }

    expect(
      result.error.flatten().fieldErrors.chatStyleLanguageMode,
    ).toBeDefined();
    expect(
      result.error.flatten().fieldErrors.chatStyleManualLanguage,
    ).toBeDefined();
  });
});

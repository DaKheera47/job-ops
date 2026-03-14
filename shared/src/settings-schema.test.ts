import { describe, expect, it } from "vitest";
import { updateSettingsSchema } from "./settings-schema";

describe("updateSettingsSchema", () => {
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

  it("accepts a nullable rxresumeUrl and rejects invalid URLs", () => {
    expect(
      updateSettingsSchema.parse({
        rxresumeUrl: "https://resume.example.com",
      }),
    ).toEqual({
      rxresumeUrl: "https://resume.example.com",
    });

    expect(
      updateSettingsSchema.parse({
        rxresumeUrl: null,
      }),
    ).toEqual({
      rxresumeUrl: null,
    });

    const result = updateSettingsSchema.safeParse({
      rxresumeUrl: "not-a-url",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.error.flatten().fieldErrors.rxresumeUrl).toBeDefined();
  });
});

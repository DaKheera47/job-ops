import { describe, expect, it } from "vitest";
import { updateSettingsSchema } from "./settings-schema";

describe("updateSettingsSchema", () => {
  it("accepts supported PDF renderer values and rejects unsupported ones", () => {
    expect(
      updateSettingsSchema.parse({
        pdfRenderer: "latex",
      }),
    ).toEqual({
      pdfRenderer: "latex",
    });

    expect(
      updateSettingsSchema.parse({
        pdfRenderer: null,
      }),
    ).toEqual({
      pdfRenderer: null,
    });

    const result = updateSettingsSchema.safeParse({
      pdfRenderer: "custom",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.flatten().fieldErrors.pdfRenderer).toBeDefined();
  });

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

  it("accepts prompt template overrides up to 12000 characters", () => {
    const prompt = "A".repeat(12000);

    expect(
      updateSettingsSchema.parse({
        ghostwriterSystemPromptTemplate: prompt,
        tailoringPromptTemplate: prompt,
        scoringPromptTemplate: prompt,
      }),
    ).toEqual({
      ghostwriterSystemPromptTemplate: prompt,
      tailoringPromptTemplate: prompt,
      scoringPromptTemplate: prompt,
    });
  });

  it("rejects prompt template overrides above 12000 characters", () => {
    const result = updateSettingsSchema.safeParse({
      ghostwriterSystemPromptTemplate: "A".repeat(12001),
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(
      result.error.flatten().fieldErrors.ghostwriterSystemPromptTemplate,
    ).toBeDefined();
  });
});

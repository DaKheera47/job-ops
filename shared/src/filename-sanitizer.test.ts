import { describe, expect, it } from "vitest";
import { safeFilenamePart, safePdfFileName } from "./filename-sanitizer";

describe("safeFilenamePart", () => {
  it("uses German transliteration for German filenames", () => {
    expect(safeFilenamePart("Müller Büro Straße", { language: "german" })).toBe(
      "Mueller_Buero_Strasse",
    );
  });

  it("uses French transliteration for French filenames", () => {
    expect(
      safeFilenamePart("Développeur François Cœur", {
        language: "french",
      }),
    ).toBe("Developpeur_Francois_Coeur");
  });

  it("uses Spanish transliteration for Spanish filenames", () => {
    expect(
      safeFilenamePart("Niño Vergüenza ¿Qué?", { language: "spanish" }),
    ).toBe("Nino_Verguenza__Que_");
  });

  it("falls back to Unknown for unsupported or punctuation-only input", () => {
    expect(safeFilenamePart("")).toBe("Unknown");
    expect(safeFilenamePart("!!!")).toBe("Unknown");
    expect(safeFilenamePart("東京")).toBe("Unknown");
  });
});

describe("safePdfFileName", () => {
  it("keeps one pdf extension and trims unsafe edge separators", () => {
    expect(
      safePdfFileName("Müller Büro.pdf", {
        language: "german",
        fallbackBase: "Design_Resume",
      }),
    ).toBe("Mueller_Buero.pdf");
  });

  it("uses the configured fallback when the PDF stem is empty", () => {
    expect(
      safePdfFileName("!!!.pdf", {
        fallbackBase: "Design Resume",
      }),
    ).toBe("Design_Resume.pdf");
  });

  it("falls back to Unknown when the PDF stem and fallback are both unsafe", () => {
    expect(
      safePdfFileName("", {
        fallbackBase: "!!!",
      }),
    ).toBe("Unknown.pdf");
  });
});

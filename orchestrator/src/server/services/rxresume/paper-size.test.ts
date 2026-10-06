import { describe, expect, it } from "vitest";
import {
  applyPdfPaperSizeToResumeData,
  resolveRxResumePageFormat,
} from "./paper-size";

describe("resolveRxResumePageFormat", () => {
  it("keeps the resume's own format when the paper size is left to the renderer", () => {
    expect(resolveRxResumePageFormat("auto", "a4")).toBe("a4");
    expect(resolveRxResumePageFormat("auto", "letter")).toBe("letter");
    expect(resolveRxResumePageFormat("auto", "free-form")).toBe("free-form");
  });

  it("overrides a fixed resume format with the requested paper size", () => {
    expect(resolveRxResumePageFormat("letter", "a4")).toBe("letter");
    expect(resolveRxResumePageFormat("a4", "letter")).toBe("a4");
    expect(resolveRxResumePageFormat("letter", "letter")).toBe("letter");
  });

  it("leaves a free-form resume continuous even when a paper size is requested", () => {
    expect(resolveRxResumePageFormat("letter", "free-form")).toBe("free-form");
    expect(resolveRxResumePageFormat("a4", "free-form")).toBe("free-form");
  });
});

describe("applyPdfPaperSizeToResumeData", () => {
  const resumeData = {
    basics: { name: "Jane Doe" },
    metadata: {
      template: "onyx",
      page: { format: "a4", marginX: 14, marginY: 12 },
    },
  };

  it("writes the requested format without touching other page settings", () => {
    expect(applyPdfPaperSizeToResumeData(resumeData, "letter")).toEqual({
      basics: { name: "Jane Doe" },
      metadata: {
        template: "onyx",
        page: { format: "letter", marginX: 14, marginY: 12 },
      },
    });
  });

  it("does not mutate the resume it was given", () => {
    applyPdfPaperSizeToResumeData(resumeData, "letter");

    expect(resumeData.metadata.page.format).toBe("a4");
  });

  it("returns the resume unchanged when the paper size is left to the renderer", () => {
    expect(applyPdfPaperSizeToResumeData(resumeData, "auto")).toEqual(
      resumeData,
    );
  });

  it("treats a missing or unknown page format as A4, like the importer does", () => {
    expect(
      applyPdfPaperSizeToResumeData({ metadata: { page: {} } }, "letter"),
    ).toEqual({ metadata: { page: { format: "letter" } } });
    expect(applyPdfPaperSizeToResumeData({}, "letter")).toEqual({
      metadata: { page: { format: "letter" } },
    });
  });
});

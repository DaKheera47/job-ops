import { describe, expect, it } from "vitest";
import {
  canOpenJobDocumentInline,
  canPreviewJobDocumentAsObject,
  canPreviewJobDocumentAsText,
  canUseJobDocumentForTextContext,
} from "./job-documents";

describe("job document helpers", () => {
  it("allows DOCX as Ghostwriter context but not as raw browser text preview", () => {
    const document = {
      fileName: "interview-pack.docx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    expect(canUseJobDocumentForTextContext(document)).toBe(true);
    expect(canPreviewJobDocumentAsText(document)).toBe(false);
    expect(canOpenJobDocumentInline(document)).toBe(false);
  });

  it("does not inline SVG even though it is an image media type", () => {
    const document = {
      fileName: "diagram.svg",
      mediaType: "image/svg+xml",
    };

    expect(canPreviewJobDocumentAsObject(document)).toBe(false);
    expect(canOpenJobDocumentInline(document)).toBe(false);
  });
});

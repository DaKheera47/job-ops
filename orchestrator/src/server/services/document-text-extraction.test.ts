import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

import pdfParse from "pdf-parse";
import {
  DocxTextExtractionError,
  extractDocxText,
  extractPdfText,
} from "./document-text-extraction";

function makePdfParseResult(text: string) {
  return {
    numpages: 1,
    numrender: 1,
    info: {},
    metadata: null,
    version: "default" as const,
    text,
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function makeDocxBuffer(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("document text extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts readable PDF text", async () => {
    vi.mocked(pdfParse).mockResolvedValueOnce(
      makePdfParseResult("  Taylor Quinn\nSenior Engineer  "),
    );

    await expect(extractPdfText(Buffer.from("%PDF-1.4"))).resolves.toBe(
      "Taylor Quinn\nSenior Engineer",
    );
  });

  it("rejects PDFs with no readable text", async () => {
    vi.mocked(pdfParse).mockResolvedValueOnce(makePdfParseResult("   "));

    await expect(extractPdfText(Buffer.from("%PDF-1.4"))).rejects.toMatchObject(
      {
        name: "PdfTextExtractionError",
        code: "EMPTY_TEXT",
      },
    );
  });

  it("rejects unreadable or encrypted PDFs", async () => {
    vi.mocked(pdfParse).mockRejectedValueOnce(new Error("invalid pdf"));

    await expect(
      extractPdfText(Buffer.from("not a pdf")),
    ).rejects.toMatchObject({
      name: "PdfTextExtractionError",
      code: "INVALID_PDF",
    });
  });

  it("extracts readable DOCX text", async () => {
    const buffer = await makeDocxBuffer("Taylor & Quinn\nSenior Engineer");

    await expect(extractDocxText(buffer)).resolves.toBe(
      "Taylor & Quinn\nSenior Engineer",
    );
  });

  it("rejects invalid DOCX files", async () => {
    await expect(
      extractDocxText(Buffer.from("not a docx")),
    ).rejects.toBeInstanceOf(DocxTextExtractionError);
    await expect(
      extractDocxText(Buffer.from("not a docx")),
    ).rejects.toMatchObject({
      code: "INVALID_DOCX",
    });
  });

  it("rejects DOCX files missing document XML", async () => {
    const zip = new JSZip();
    zip.file("word/styles.xml", "<xml />");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractDocxText(buffer)).rejects.toMatchObject({
      code: "MISSING_DOCUMENT",
    });
  });
});

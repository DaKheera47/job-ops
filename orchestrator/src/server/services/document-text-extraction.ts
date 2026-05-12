import JSZip from "jszip";

export type DocxTextExtractionErrorCode = "INVALID_DOCX" | "MISSING_DOCUMENT";

export class DocxTextExtractionError extends Error {
  code: DocxTextExtractionErrorCode;

  constructor(code: DocxTextExtractionErrorCode, message: string) {
    super(message);
    this.name = "DocxTextExtractionError";
    this.code = code;
  }
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|amp|lt|gt|quot|apos);/g,
    (match, hex, dec) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
      switch (match) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        case "&apos;":
          return "'";
        default:
          return match;
      }
    },
  );
}

export function normalizeDocxXmlText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<w:cr\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<w:t\b[^>]*>/g, "")
      .replace(/<\/w:t>/g, "")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxTextExtractionError(
      "INVALID_DOCX",
      "DOCX file could not be read.",
    );
  }

  const documentXml = zip.file("word/document.xml");
  if (!documentXml) {
    throw new DocxTextExtractionError(
      "MISSING_DOCUMENT",
      "DOCX file is missing document content.",
    );
  }

  const xml = await documentXml.async("string");
  return normalizeDocxXmlText(xml);
}

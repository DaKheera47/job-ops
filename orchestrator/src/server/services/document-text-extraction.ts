import JSZip from "jszip";

export type DocxTextExtractionErrorCode = "INVALID_DOCX" | "MISSING_DOCUMENT";
export type PdfTextExtractionErrorCode = "INVALID_PDF" | "EMPTY_TEXT";

export class DocxTextExtractionError extends Error {
  code: DocxTextExtractionErrorCode;

  constructor(code: DocxTextExtractionErrorCode, message: string) {
    super(message);
    this.name = "DocxTextExtractionError";
    this.code = code;
  }
}

export class PdfTextExtractionError extends Error {
  code: PdfTextExtractionErrorCode;

  constructor(code: PdfTextExtractionErrorCode, message: string) {
    super(message);
    this.name = "PdfTextExtractionError";
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

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getRecordString(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPdfAnnotationString(
  annotation: Record<string, unknown>,
  key: string,
): string | null {
  const direct = getRecordString(annotation, key);
  if (direct) return direct;

  const objectValue = annotation[key];
  if (objectValue && typeof objectValue === "object") {
    return getRecordString(objectValue as Record<string, unknown>, "str");
  }

  return null;
}

async function extractPdfLinkTargets(buffer: Buffer): Promise<string[]> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument: (options: { data: Uint8Array; disableWorker: boolean }) => {
      promise: Promise<{
        destroy?: () => Promise<void>;
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getAnnotations: (options?: {
            intent?: "display" | "print" | "any";
          }) => Promise<unknown[]>;
        }>;
      }>;
    };
    AnnotationType: { LINK: number };
  };

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  });
  const document = await loadingTask.promise;

  try {
    const links: string[] = [];
    const seen = new Set<string>();

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const annotations = await page.getAnnotations({ intent: "display" });

      for (const rawAnnotation of annotations) {
        if (
          !rawAnnotation ||
          typeof rawAnnotation !== "object" ||
          Array.isArray(rawAnnotation)
        ) {
          continue;
        }

        const annotation = rawAnnotation as Record<string, unknown>;
        const annotationType =
          typeof annotation.annotationType === "number"
            ? annotation.annotationType
            : null;
        const subtype = getRecordString(annotation, "subtype")?.toLowerCase();
        const isLink =
          annotationType === pdfjs.AnnotationType.LINK || subtype === "link";
        if (!isLink) continue;

        const url =
          getPdfAnnotationString(annotation, "url") ||
          getPdfAnnotationString(annotation, "unsafeUrl");
        if (!url || !isHttpUrl(url)) continue;

        const normalized = url.replace(/\/+$/, "");
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        links.push(url);
      }
    }

    return links;
  } finally {
    await document.destroy?.();
  }
}

function appendPdfLinkTargets(text: string, links: string[]): string {
  if (links.length === 0) return text;

  return [
    text,
    "Embedded PDF hyperlinks:",
    ...links.map((link) => `- ${link}`),
  ].join("\n");
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { default: pdfParse } = await import("pdf-parse");
    const data = (await pdfParse(buffer)) as { text?: string };
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (!text) {
      throw new PdfTextExtractionError(
        "EMPTY_TEXT",
        "PDF file did not contain readable text.",
      );
    }
    let linkTargets: string[] = [];
    try {
      linkTargets = await extractPdfLinkTargets(buffer);
    } catch {
      linkTargets = [];
    }
    return appendPdfLinkTargets(text, linkTargets);
  } catch (error) {
    if (error instanceof PdfTextExtractionError) {
      throw error;
    }
    throw new PdfTextExtractionError(
      "INVALID_PDF",
      "PDF file could not be read or is encrypted.",
    );
  }
}

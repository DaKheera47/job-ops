import type { PdfPaperSize } from "@shared/types";

export type RxResumePageFormat = "a4" | "letter" | "free-form";

const RX_RESUME_PAGE_FORMATS = new Set<string>(["a4", "letter", "free-form"]);

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}

/**
 * Decides which page format Reactive Resume should print with, given the
 * JobOps paper size setting and the format stored on the resume itself.
 *
 * `free-form` is Reactive Resume's single continuous page. It can only be
 * chosen deliberately inside Reactive Resume and has no A4/Letter equivalent,
 * so a requested paper size never paginates it.
 */
export function resolveRxResumePageFormat(
  paperSize: PdfPaperSize,
  documentFormat: RxResumePageFormat,
): RxResumePageFormat {
  if (paperSize === "auto" || documentFormat === "free-form") {
    return documentFormat;
  }

  return paperSize;
}

export function applyPdfPaperSizeToResumeData(
  resumeData: RecordLike,
  paperSize: PdfPaperSize,
): RecordLike {
  if (paperSize === "auto") return resumeData;

  const metadata = asRecord(resumeData.metadata);
  const page = asRecord(metadata.page);
  const documentFormat = RX_RESUME_PAGE_FORMATS.has(String(page.format))
    ? (page.format as RxResumePageFormat)
    : "a4";

  return {
    ...resumeData,
    metadata: {
      ...metadata,
      page: {
        ...page,
        format: resolveRxResumePageFormat(paperSize, documentFormat),
      },
    },
  };
}

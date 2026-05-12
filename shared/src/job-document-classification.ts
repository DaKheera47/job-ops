import type { JobDocument } from "./types";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const TEXT_DOCUMENT_EXTENSIONS = new Set([
  "csv",
  "docx",
  "json",
  "log",
  "markdown",
  "md",
  "tsv",
  "txt",
  "xml",
]);

const TEXT_DOCUMENT_MEDIA_TYPES = new Set([
  "application/json",
  "application/x-ndjson",
  "application/xml",
  DOCX_MIME,
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/tab-separated-values",
]);

export type JobDocumentTypeTarget = Pick<JobDocument, "fileName" | "mediaType">;

export function getJobDocumentFileExtension(fileName: string): string {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension && extension !== fileName.toLowerCase() ? extension : "";
}

export function isJobDocumentPdf(document: JobDocumentTypeTarget): boolean {
  return (
    document.mediaType?.toLowerCase() === "application/pdf" ||
    getJobDocumentFileExtension(document.fileName) === "pdf"
  );
}

export function isJobDocumentDocx(document: JobDocumentTypeTarget): boolean {
  return (
    document.mediaType?.toLowerCase() === DOCX_MIME ||
    getJobDocumentFileExtension(document.fileName) === "docx"
  );
}

export function isJobDocumentImage(document: JobDocumentTypeTarget): boolean {
  return Boolean(document.mediaType?.toLowerCase().startsWith("image/"));
}

export function isJobDocumentTextLike(
  document: JobDocumentTypeTarget,
): boolean {
  const mediaType = document.mediaType?.toLowerCase() ?? "";
  return (
    mediaType.startsWith("text/") ||
    TEXT_DOCUMENT_MEDIA_TYPES.has(mediaType) ||
    TEXT_DOCUMENT_EXTENSIONS.has(getJobDocumentFileExtension(document.fileName))
  );
}

export function canUseJobDocumentForTextContext(
  document: JobDocumentTypeTarget,
): boolean {
  return isJobDocumentPdf(document) || isJobDocumentTextLike(document);
}

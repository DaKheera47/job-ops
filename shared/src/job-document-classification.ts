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

const RAW_TEXT_PREVIEW_EXTENSIONS = new Set(
  [...TEXT_DOCUMENT_EXTENSIONS].filter((extension) => extension !== "docx"),
);

const RAW_TEXT_PREVIEW_MEDIA_TYPES = new Set(
  [...TEXT_DOCUMENT_MEDIA_TYPES].filter((mediaType) => mediaType !== DOCX_MIME),
);

const SAFE_INLINE_IMAGE_MEDIA_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SAFE_INLINE_IMAGE_EXTENSIONS_TO_MEDIA_TYPE = new Map([
  ["avif", "image/avif"],
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
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

export function getSafeInlineJobDocumentImageMediaType(
  document: JobDocumentTypeTarget,
): string | null {
  const mediaType = document.mediaType?.toLowerCase() ?? "";
  if (SAFE_INLINE_IMAGE_MEDIA_TYPES.has(mediaType)) return mediaType;
  return (
    SAFE_INLINE_IMAGE_EXTENSIONS_TO_MEDIA_TYPE.get(
      getJobDocumentFileExtension(document.fileName),
    ) ?? null
  );
}

export function isJobDocumentSafeInlineImage(
  document: JobDocumentTypeTarget,
): boolean {
  return Boolean(getSafeInlineJobDocumentImageMediaType(document));
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

export function canPreviewJobDocumentAsRawText(
  document: JobDocumentTypeTarget,
): boolean {
  const mediaType = document.mediaType?.toLowerCase() ?? "";
  return (
    RAW_TEXT_PREVIEW_MEDIA_TYPES.has(mediaType) ||
    RAW_TEXT_PREVIEW_EXTENSIONS.has(
      getJobDocumentFileExtension(document.fileName),
    )
  );
}

export function getSafeInlineJobDocumentMediaType(
  document: JobDocumentTypeTarget,
): string | null {
  if (isJobDocumentPdf(document)) return "application/pdf";
  const imageMediaType = getSafeInlineJobDocumentImageMediaType(document);
  if (imageMediaType) return imageMediaType;
  if (canPreviewJobDocumentAsRawText(document)) return "text/plain";
  return null;
}

export function canOpenJobDocumentInline(
  document: JobDocumentTypeTarget,
): boolean {
  return Boolean(getSafeInlineJobDocumentMediaType(document));
}

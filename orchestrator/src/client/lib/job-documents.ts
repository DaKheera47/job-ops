import type { JobDocument } from "@shared/types.js";

const bytesFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

export type JobDocumentPreviewTarget = Pick<
  JobDocument,
  "fileName" | "mediaType"
>;

export function formatJobDocumentByteSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) {
    return `${bytesFormatter.format(byteSize / 1024)} KB`;
  }
  return `${bytesFormatter.format(byteSize / (1024 * 1024))} MB`;
}

export function getJobDocumentFileExtension(fileName: string): string {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension && extension !== fileName.toLowerCase() ? extension : "";
}

export function isJobDocumentPdf(document: JobDocumentPreviewTarget): boolean {
  return (
    document.mediaType === "application/pdf" ||
    getJobDocumentFileExtension(document.fileName) === "pdf"
  );
}

export function isJobDocumentImage(
  document: JobDocumentPreviewTarget,
): boolean {
  return Boolean(document.mediaType?.startsWith("image/"));
}

export function isJobDocumentTextLike(
  document: JobDocumentPreviewTarget,
): boolean {
  const extension = getJobDocumentFileExtension(document.fileName);
  return (
    document.mediaType?.startsWith("text/") ||
    document.mediaType === "application/json" ||
    document.mediaType === "application/xml" ||
    ["csv", "json", "md", "markdown", "txt", "xml", "log"].includes(extension)
  );
}

export function canPreviewJobDocumentAsObject(
  document: JobDocumentPreviewTarget,
): boolean {
  return isJobDocumentPdf(document) || isJobDocumentImage(document);
}

export function canPreviewJobDocumentAsText(
  document: JobDocumentPreviewTarget,
): boolean {
  return isJobDocumentTextLike(document);
}

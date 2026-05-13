import {
  canOpenJobDocumentInline,
  canPreviewJobDocumentAsRawText,
  canUseJobDocumentForTextContext,
  getJobDocumentFileExtension,
  isJobDocumentDocx,
  isJobDocumentImage,
  isJobDocumentPdf,
  isJobDocumentSafeInlineImage,
  isJobDocumentTextLike,
  type JobDocumentTypeTarget,
} from "@shared/job-document-classification.js";

export {
  canOpenJobDocumentInline,
  canPreviewJobDocumentAsRawText,
  canUseJobDocumentForTextContext,
  getJobDocumentFileExtension,
  isJobDocumentDocx,
  isJobDocumentImage,
  isJobDocumentPdf,
  isJobDocumentSafeInlineImage,
  isJobDocumentTextLike,
};
export type { JobDocumentTypeTarget };

const bytesFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

export function formatJobDocumentByteSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) {
    return `${bytesFormatter.format(byteSize / 1024)} KB`;
  }
  return `${bytesFormatter.format(byteSize / (1024 * 1024))} MB`;
}

export function canPreviewJobDocumentAsObject(
  document: JobDocumentTypeTarget,
): boolean {
  return isJobDocumentPdf(document) || isJobDocumentSafeInlineImage(document);
}

export function canPreviewJobDocumentAsText(
  document: JobDocumentTypeTarget,
): boolean {
  return canPreviewJobDocumentAsRawText(document);
}

import * as api from "@/client/api";

function openBlob(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  if (filename) anchor.download = filename;
  if (!filename) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function openJobPdf(jobId: string): Promise<void> {
  openBlob(await api.getJobPdfBlob(jobId));
}

export async function downloadJobPdf(
  jobId: string,
  filename: string,
): Promise<void> {
  openBlob(await api.getJobPdfBlob(jobId), filename);
}

export async function createJobPdfObjectUrl(jobId: string): Promise<string> {
  return URL.createObjectURL(await api.getJobPdfBlob(jobId));
}

export async function openJobDocument(
  jobId: string,
  documentId: string,
): Promise<void> {
  openBlob(await api.getJobDocumentBlob(jobId, documentId));
}

export async function downloadJobDocument(
  jobId: string,
  documentId: string,
  filename: string,
): Promise<void> {
  openBlob(await api.getJobDocumentBlob(jobId, documentId), filename);
}

export async function createJobDocumentObjectUrl(
  jobId: string,
  documentId: string,
): Promise<string> {
  return URL.createObjectURL(await api.getJobDocumentBlob(jobId, documentId));
}

export async function createDesignResumePdfObjectUrl(
  pdfUrl?: string,
): Promise<string> {
  const blob = await api.getDesignResumePdfBlob(pdfUrl);
  return URL.createObjectURL(blob);
}

export async function downloadDesignResumePdf(
  filename: string,
  pdfUrl?: string,
): Promise<void> {
  openBlob(await api.getDesignResumePdfBlob(pdfUrl), filename);
}

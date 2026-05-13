import * as api from "@/client/api";
import {
  canOpenJobDocumentInline,
  type JobDocumentTypeTarget,
} from "@/client/lib/job-documents";

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

async function createObjectUrlFromBlob(
  loadBlob: () => Promise<Blob>,
): Promise<string> {
  return URL.createObjectURL(await loadBlob());
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
  return createObjectUrlFromBlob(() => api.getJobPdfBlob(jobId));
}

export async function openJobDocument(
  jobId: string,
  document: JobDocumentTypeTarget & { id: string },
): Promise<void> {
  if (!canOpenJobDocumentInline(document)) {
    openBlob(
      await api.getJobDocumentBlob(jobId, document.id),
      document.fileName,
    );
    return;
  }
  openBlob(await api.getJobDocumentBlob(jobId, document.id));
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
  return createObjectUrlFromBlob(() =>
    api.getJobDocumentBlob(jobId, documentId),
  );
}

export async function createDesignResumePdfObjectUrl(
  pdfUrl?: string,
): Promise<string> {
  return createObjectUrlFromBlob(() => api.getDesignResumePdfBlob(pdfUrl));
}

export async function downloadDesignResumePdf(
  filename: string,
  pdfUrl?: string,
): Promise<void> {
  openBlob(await api.getDesignResumePdfBlob(pdfUrl), filename);
}

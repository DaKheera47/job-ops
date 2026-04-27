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

export async function createDesignResumePdfObjectUrl(): Promise<string> {
  const blob = await api.getDesignResumePdfBlob();
  return URL.createObjectURL(blob);
}

export async function downloadDesignResumePdf(filename: string): Promise<void> {
  openBlob(await api.getDesignResumePdfBlob(), filename);
}

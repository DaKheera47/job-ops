import * as api from "@client/api";
import { fileToDataUrl } from "@client/components/design-resume/utils";
import type { Job } from "@shared/types";

export async function uploadJobPdfFromFile(
  jobId: string,
  file: File,
): Promise<Job> {
  const dataUrl = await fileToDataUrl(file);
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());

  if (!match) {
    throw new Error("PDF file could not be encoded for upload.");
  }

  return api.uploadJobPdf(jobId, {
    fileName: file.name,
    mediaType: file.type || match[1],
    dataBase64: match[2],
  });
}

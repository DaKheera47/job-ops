import * as api from "@client/api";
import { fileToDataUrl } from "@client/components/design-resume/utils";
import type { JobDocument } from "@shared/types";

export async function uploadJobDocumentFromFile(
  jobId: string,
  file: File,
): Promise<JobDocument> {
  const dataUrl = await fileToDataUrl(file);
  const match = /^data:([^;]*);base64,(.+)$/s.exec(dataUrl.trim());

  if (!match) {
    throw new Error("Document could not be encoded for upload.");
  }

  return api.uploadJobDocument(jobId, {
    fileName: file.name,
    mediaType: file.type || match[1] || null,
    dataBase64: match[2],
  });
}

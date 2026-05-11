import * as api from "@client/api";
import type { Job } from "@shared/types";
import { fileToUploadPayload } from "./file-upload-payload";

export async function uploadJobPdfFromFile(
  jobId: string,
  file: File,
): Promise<Job> {
  const payload = await fileToUploadPayload(
    file,
    "PDF file could not be encoded for upload.",
  );

  return api.uploadJobPdf(jobId, {
    fileName: payload.fileName,
    mediaType: payload.mediaType ?? undefined,
    dataBase64: payload.dataBase64,
  });
}

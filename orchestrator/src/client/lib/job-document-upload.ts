import * as api from "@client/api";
import type { JobDocument } from "@shared/types";
import { fileToUploadPayload } from "./file-upload-payload";

export async function uploadJobDocumentFromFile(
  jobId: string,
  file: File,
): Promise<JobDocument> {
  const payload = await fileToUploadPayload(
    file,
    "Document could not be encoded for upload.",
  );

  return api.uploadJobDocument(jobId, {
    fileName: payload.fileName,
    mediaType: payload.mediaType,
    dataBase64: payload.dataBase64,
  });
}

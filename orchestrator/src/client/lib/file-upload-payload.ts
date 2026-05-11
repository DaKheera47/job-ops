import { fileToDataUrl } from "@client/components/design-resume/utils";

export type FileUploadPayload = {
  fileName: string;
  mediaType: string | null;
  dataBase64: string;
};

export async function fileToUploadPayload(
  file: File,
  errorMessage: string,
): Promise<FileUploadPayload> {
  const dataUrl = await fileToDataUrl(file);
  const match = /^data:([^;]*);base64,(.+)$/s.exec(dataUrl.trim());

  if (!match) {
    throw new Error(errorMessage);
  }

  return {
    fileName: file.name,
    mediaType: file.type || match[1] || null,
    dataBase64: match[2],
  };
}

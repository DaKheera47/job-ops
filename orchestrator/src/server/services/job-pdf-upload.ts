import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { badRequest } from "@infra/errors";
import { getTenantJobPdfPath, getTenantPdfDir } from "./pdf-storage";

type UploadJobPdfInput = {
  jobId: string;
  fileName: string;
  mediaType?: string | null;
  dataBase64: string;
};

const MAX_UPLOAD_PDF_BYTES = 10 * 1024 * 1024;

function normalizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    throw badRequest("Resume upload requires a file name.");
  }
  if (trimmed.length > 255) {
    throw badRequest("Resume file names must be 255 characters or shorter.");
  }
  return trimmed;
}

function normalizePdfMediaType(input: {
  fileName: string;
  mediaType?: string | null;
}): void {
  const extension = input.fileName.toLowerCase().split(".").pop() ?? "";
  const normalizedMediaType = input.mediaType?.trim().toLowerCase() ?? "";

  if (normalizedMediaType === "application/pdf") {
    return;
  }

  if (
    (!normalizedMediaType ||
      normalizedMediaType === "application/octet-stream") &&
    extension === "pdf"
  ) {
    return;
  }

  throw badRequest("Only PDF resumes are supported.");
}

function normalizeBase64Payload(dataBase64: string): string {
  const trimmed = dataBase64.trim();
  if (!trimmed) {
    throw badRequest("Resume upload requires file data.");
  }

  const normalized = trimmed.replace(/\s+/g, "");
  if (!normalized) {
    throw badRequest("Resume upload requires file data.");
  }

  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw badRequest("Resume file data must be valid base64.");
  }

  const paddingLength = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  const estimatedByteLength = (normalized.length / 4) * 3 - paddingLength;
  if (estimatedByteLength > MAX_UPLOAD_PDF_BYTES) {
    throw badRequest("Resume PDFs must be 10 MB or smaller.");
  }

  return normalized;
}

function decodeBase64Payload(dataBase64: string): Buffer {
  const normalized = normalizeBase64Payload(dataBase64);
  const decoded = Buffer.from(normalized, "base64");

  if (decoded.toString("base64") !== normalized) {
    throw badRequest("Resume file data must be valid base64.");
  }

  if (decoded.byteLength === 0) {
    throw badRequest("Resume file data must not be empty.");
  }

  if (decoded.byteLength > MAX_UPLOAD_PDF_BYTES) {
    throw badRequest("Resume PDFs must be 10 MB or smaller.");
  }

  return decoded;
}

function assertPdfSignature(decoded: Buffer): void {
  if (decoded.byteLength < 5 || decoded.subarray(0, 5).toString() !== "%PDF-") {
    throw badRequest("Uploaded file must be a valid PDF.");
  }
}

export async function uploadJobPdf(input: UploadJobPdfInput): Promise<{
  outputPath: string;
  byteLength: number;
}> {
  const fileName = normalizeFileName(input.fileName);
  normalizePdfMediaType({
    fileName,
    mediaType: input.mediaType,
  });

  const decoded = decodeBase64Payload(input.dataBase64);
  assertPdfSignature(decoded);

  const pdfDir = getTenantPdfDir();
  const outputPath = getTenantJobPdfPath(input.jobId);
  const tempPath = join(pdfDir, `resume_${input.jobId}.${randomUUID()}.tmp`);

  await mkdir(pdfDir, { recursive: true });

  try {
    await writeFile(tempPath, decoded);
    await rename(tempPath, outputPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return {
    outputPath,
    byteLength: decoded.byteLength,
  };
}

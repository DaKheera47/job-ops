import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { badRequest } from "@infra/errors";
import { getDataDir } from "@server/config/dataDir";
import { getActiveTenantId } from "@server/tenancy/context";

const MAX_JOB_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type StoredJobDocumentInput = {
  jobId: string;
  fileName: string;
  mediaType?: string | null;
  dataBase64: string;
};

function getTenantJobDocumentsDir(
  jobId: string,
  tenantId = getActiveTenantId(),
): string {
  return join(getDataDir(), "job-documents", tenantId, jobId);
}

export function normalizeJobDocumentFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    throw badRequest("Document upload requires a file name.");
  }
  if (trimmed.length > 255) {
    throw badRequest("Document file names must be 255 characters or shorter.");
  }
  return trimmed;
}

export function normalizeJobDocumentMediaType(
  mediaType?: string | null,
): string | null {
  const normalized = mediaType?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (normalized.length > 200) {
    throw badRequest("Document media type must be 200 characters or shorter.");
  }
  return normalized;
}

export function decodeJobDocumentBase64(dataBase64: string): Buffer {
  const trimmed = dataBase64.trim();
  if (!trimmed) {
    throw badRequest("Document upload requires file data.");
  }

  const normalized = trimmed.replace(/\s+/g, "");
  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw badRequest("Document file data must be valid base64.");
  }

  const paddingLength = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  const estimatedByteLength = (normalized.length / 4) * 3 - paddingLength;
  if (estimatedByteLength > MAX_JOB_DOCUMENT_BYTES) {
    throw badRequest("Documents must be 10 MB or smaller.");
  }

  const decoded = Buffer.from(normalized, "base64");
  if (decoded.toString("base64") !== normalized) {
    throw badRequest("Document file data must be valid base64.");
  }
  if (decoded.byteLength === 0) {
    throw badRequest("Document file data must not be empty.");
  }
  if (decoded.byteLength > MAX_JOB_DOCUMENT_BYTES) {
    throw badRequest("Documents must be 10 MB or smaller.");
  }

  return decoded;
}

export async function storeJobDocument(input: StoredJobDocumentInput): Promise<{
  fileName: string;
  mediaType: string | null;
  byteSize: number;
  storagePath: string;
}> {
  const fileName = normalizeJobDocumentFileName(input.fileName);
  const mediaType = normalizeJobDocumentMediaType(input.mediaType);
  const decoded = decodeJobDocumentBase64(input.dataBase64);
  const documentsDir = getTenantJobDocumentsDir(input.jobId);
  const extension = extname(fileName).slice(0, 32);
  const storagePath = join(documentsDir, `${randomUUID()}${extension}`);
  const tempPath = join(documentsDir, `${randomUUID()}.tmp`);

  await mkdir(documentsDir, { recursive: true });

  try {
    await writeFile(tempPath, decoded);
    await rename(tempPath, storagePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return {
    fileName,
    mediaType,
    byteSize: decoded.byteLength,
    storagePath,
  };
}

export async function removeStoredJobDocument(
  storagePath: string,
): Promise<void> {
  await rm(storagePath, { force: true });
}

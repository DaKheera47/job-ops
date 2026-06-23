import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { badRequest } from "@infra/errors";
import { getDataDir } from "@server/config/dataDir";
import { getActiveTenantId } from "@server/tenancy/context";
import { getPrivateDataScope } from "@server/tenancy/private-scope";
import { decodeBase64Upload } from "./upload-base64";

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
  const scope = getPrivateDataScope();
  if (
    scope.enforceUserIsolation &&
    scope.userId &&
    tenantId === scope.tenantId
  ) {
    return join(
      getDataDir(),
      "job-documents",
      tenantId,
      "users",
      scope.userId,
      jobId,
    );
  }
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

export async function storeJobDocument(input: StoredJobDocumentInput): Promise<{
  fileName: string;
  mediaType: string | null;
  byteSize: number;
  storagePath: string;
}> {
  const fileName = normalizeJobDocumentFileName(input.fileName);
  const mediaType = normalizeJobDocumentMediaType(input.mediaType);
  const decoded = decodeBase64Upload({
    dataBase64: input.dataBase64,
    maxBytes: MAX_JOB_DOCUMENT_BYTES,
    emptyMessage: "Document upload requires file data.",
    invalidMessage: "Document file data must be valid base64.",
    tooLargeMessage: "Documents must be 10 MB or smaller.",
  });
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

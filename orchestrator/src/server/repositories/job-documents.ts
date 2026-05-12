import { randomUUID } from "node:crypto";
import type { JobDocument } from "@shared/types";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { jobDocuments } = schema;

type CreateJobDocumentInput = {
  jobId: string;
  fileName: string;
  mediaType: string | null;
  byteSize: number;
  storagePath: string;
};

export type JobDocumentWithStorage = JobDocument & {
  storagePath: string;
};

function mapRowToJobDocument(
  row: typeof jobDocuments.$inferSelect,
): JobDocumentWithStorage {
  return {
    id: row.id,
    jobId: row.jobId,
    fileName: row.fileName,
    mediaType: row.mediaType ?? null,
    byteSize: row.byteSize,
    storagePath: row.storagePath,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listJobDocuments(jobId: string): Promise<JobDocument[]> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select()
    .from(jobDocuments)
    .where(
      and(eq(jobDocuments.tenantId, tenantId), eq(jobDocuments.jobId, jobId)),
    )
    .orderBy(desc(jobDocuments.createdAt), desc(jobDocuments.id));

  return rows
    .map(mapRowToJobDocument)
    .map(({ storagePath: _storagePath, ...document }) => document);
}

export async function createJobDocument(
  input: CreateJobDocumentInput,
): Promise<JobDocument> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(jobDocuments).values({
    id,
    tenantId,
    jobId: input.jobId,
    fileName: input.fileName,
    mediaType: input.mediaType,
    byteSize: input.byteSize,
    storagePath: input.storagePath,
    createdAt: now,
    updatedAt: now,
  });

  const document = await getJobDocumentForJob(input.jobId, id);
  if (!document) {
    throw new Error("Created job document could not be loaded.");
  }
  const { storagePath: _storagePath, ...publicDocument } = document;
  return publicDocument;
}

export async function getJobDocumentForJob(
  jobId: string,
  documentId: string,
): Promise<JobDocumentWithStorage | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(jobDocuments)
    .where(
      and(
        eq(jobDocuments.tenantId, tenantId),
        eq(jobDocuments.jobId, jobId),
        eq(jobDocuments.id, documentId),
      ),
    );

  return row ? mapRowToJobDocument(row) : null;
}

export async function listJobDocumentsByIds(
  jobId: string,
  documentIds: readonly string[],
): Promise<JobDocumentWithStorage[]> {
  if (documentIds.length === 0) return [];

  const tenantId = getActiveTenantId();
  const rows = await db
    .select()
    .from(jobDocuments)
    .where(
      and(
        eq(jobDocuments.tenantId, tenantId),
        eq(jobDocuments.jobId, jobId),
        inArray(jobDocuments.id, [...documentIds]),
      ),
    );

  return rows.map(mapRowToJobDocument);
}

export async function deleteJobDocumentForJob(
  jobId: string,
  documentId: string,
): Promise<JobDocumentWithStorage | null> {
  const document = await getJobDocumentForJob(jobId, documentId);
  if (!document) return null;

  const tenantId = getActiveTenantId();
  await db
    .delete(jobDocuments)
    .where(
      and(
        eq(jobDocuments.tenantId, tenantId),
        eq(jobDocuments.jobId, jobId),
        eq(jobDocuments.id, documentId),
      ),
    );

  return document;
}

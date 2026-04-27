import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { designResumeAssets, designResumeDocuments } = schema;

export async function getLatestDesignResumeDocument() {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(designResumeDocuments)
    .where(eq(designResumeDocuments.tenantId, tenantId))
    .orderBy(desc(designResumeDocuments.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function getDesignResumeDocumentById(id: string) {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(designResumeDocuments)
    .where(
      and(
        eq(designResumeDocuments.tenantId, tenantId),
        eq(designResumeDocuments.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listDesignResumeAssets(documentId: string) {
  const tenantId = getActiveTenantId();
  return db
    .select()
    .from(designResumeAssets)
    .where(
      and(
        eq(designResumeAssets.tenantId, tenantId),
        eq(designResumeAssets.documentId, documentId),
      ),
    )
    .orderBy(desc(designResumeAssets.updatedAt));
}

export async function getDesignResumeAssetById(id: string) {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(designResumeAssets)
    .where(
      and(
        eq(designResumeAssets.tenantId, tenantId),
        eq(designResumeAssets.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertDesignResumeDocument(input: {
  id: string;
  title: string;
  resumeJson: Record<string, unknown>;
  revision: number;
  sourceResumeId: string | null;
  sourceMode: string | null;
  importedAt: string | null;
  createdAt?: string;
  updatedAt: string;
}) {
  const tenantId = getActiveTenantId();
  const existing = await getDesignResumeDocumentById(input.id);
  if (existing) {
    await db
      .update(designResumeDocuments)
      .set({
        title: input.title,
        resumeJson: input.resumeJson,
        revision: input.revision,
        sourceResumeId: input.sourceResumeId,
        sourceMode: input.sourceMode,
        importedAt: input.importedAt,
        updatedAt: input.updatedAt,
      })
      .where(
        and(
          eq(designResumeDocuments.tenantId, tenantId),
          eq(designResumeDocuments.id, input.id),
        ),
      );
  } else {
    await db.insert(designResumeDocuments).values({
      id: input.id,
      tenantId,
      title: input.title,
      resumeJson: input.resumeJson,
      revision: input.revision,
      sourceResumeId: input.sourceResumeId,
      sourceMode: input.sourceMode,
      importedAt: input.importedAt,
      createdAt: input.createdAt ?? input.updatedAt,
      updatedAt: input.updatedAt,
    });
  }

  return getDesignResumeDocumentById(input.id);
}

export async function insertDesignResumeAsset(input: {
  id: string;
  documentId: string;
  kind: "picture";
  originalName: string;
  mimeType: string;
  byteSize: number;
  storagePath: string;
  createdAt?: string;
  updatedAt: string;
}) {
  const tenantId = getActiveTenantId();
  await db.insert(designResumeAssets).values({
    id: input.id,
    tenantId,
    documentId: input.documentId,
    kind: input.kind,
    originalName: input.originalName,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    storagePath: input.storagePath,
    createdAt: input.createdAt ?? input.updatedAt,
    updatedAt: input.updatedAt,
  });

  return getDesignResumeAssetById(input.id);
}

export async function deleteDesignResumeAsset(id: string) {
  const tenantId = getActiveTenantId();
  await db
    .delete(designResumeAssets)
    .where(
      and(
        eq(designResumeAssets.tenantId, tenantId),
        eq(designResumeAssets.id, id),
      ),
    );
}

export async function deleteDesignResumeAssetsForDocument(documentId: string) {
  const tenantId = getActiveTenantId();
  await db
    .delete(designResumeAssets)
    .where(
      and(
        eq(designResumeAssets.tenantId, tenantId),
        eq(designResumeAssets.documentId, documentId),
      ),
    );
}

export async function deleteDesignResumeDocument(id: string) {
  const tenantId = getActiveTenantId();
  await db
    .delete(designResumeDocuments)
    .where(
      and(
        eq(designResumeDocuments.tenantId, tenantId),
        eq(designResumeDocuments.id, id),
      ),
    );
}

export async function findDesignResumeAssetForDocument(args: {
  documentId: string;
  kind: "picture";
}) {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(designResumeAssets)
    .where(
      and(
        eq(designResumeAssets.documentId, args.documentId),
        eq(designResumeAssets.tenantId, tenantId),
        eq(designResumeAssets.kind, args.kind),
      ),
    )
    .limit(1);
  return row ?? null;
}

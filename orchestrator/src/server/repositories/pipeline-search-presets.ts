import { randomUUID } from "node:crypto";
import { getUserId } from "@server/infra/request-context";
import type {
  CreatePipelineSearchPresetInput,
  PipelineSearchPreset,
  PipelineSearchPresetConfig,
  UpdatePipelineSearchPresetInput,
} from "@shared/types";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { pipelineSearchPresets } = schema;

function requireActiveUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new Error("User context is required for pipeline saved searches");
  }
  return userId;
}

function mapRowToSearchPreset(
  row: typeof pipelineSearchPresets.$inferSelect,
): PipelineSearchPreset {
  return {
    id: row.id,
    name: row.name,
    config: row.config as PipelineSearchPresetConfig,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export async function listPipelineSearchPresets(): Promise<
  PipelineSearchPreset[]
> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const rows = await db
    .select()
    .from(pipelineSearchPresets)
    .where(
      and(
        eq(pipelineSearchPresets.tenantId, tenantId),
        eq(pipelineSearchPresets.userId, userId),
      ),
    )
    .orderBy(
      desc(pipelineSearchPresets.lastUsedAt),
      desc(pipelineSearchPresets.updatedAt),
    );

  return rows.map(mapRowToSearchPreset);
}

export async function createPipelineSearchPreset(
  input: CreatePipelineSearchPresetInput,
): Promise<PipelineSearchPreset> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const now = new Date().toISOString();
  const id = randomUUID();

  await db.insert(pipelineSearchPresets).values({
    id,
    tenantId,
    userId,
    name: input.name,
    config: input.config,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  });

  const preset = await getPipelineSearchPreset(id);
  if (!preset) {
    throw new Error("Failed to retrieve created pipeline saved search");
  }
  return preset;
}

export async function updatePipelineSearchPreset(
  id: string,
  input: UpdatePipelineSearchPresetInput,
): Promise<PipelineSearchPreset | null> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const existing = await getPipelineSearchPreset(id);
  if (!existing) return null;

  await db
    .update(pipelineSearchPresets)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.config !== undefined ? { config: input.config } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(pipelineSearchPresets.tenantId, tenantId),
        eq(pipelineSearchPresets.userId, userId),
        eq(pipelineSearchPresets.id, id),
      ),
    );

  return getPipelineSearchPreset(id);
}

export async function markPipelineSearchPresetUsed(
  id: string,
): Promise<PipelineSearchPreset | null> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const existing = await getPipelineSearchPreset(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  await db
    .update(pipelineSearchPresets)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(
      and(
        eq(pipelineSearchPresets.tenantId, tenantId),
        eq(pipelineSearchPresets.userId, userId),
        eq(pipelineSearchPresets.id, id),
      ),
    );

  return getPipelineSearchPreset(id);
}

export async function deletePipelineSearchPreset(id: string): Promise<number> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const result = await db
    .delete(pipelineSearchPresets)
    .where(
      and(
        eq(pipelineSearchPresets.tenantId, tenantId),
        eq(pipelineSearchPresets.userId, userId),
        eq(pipelineSearchPresets.id, id),
      ),
    );

  return result.changes;
}

export async function pipelineSearchPresetNameExists(input: {
  name: string;
  excludingId?: string;
}): Promise<boolean> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const clauses = [
    eq(pipelineSearchPresets.tenantId, tenantId),
    eq(pipelineSearchPresets.userId, userId),
    eq(pipelineSearchPresets.name, input.name),
  ];
  if (input.excludingId) {
    clauses.push(ne(pipelineSearchPresets.id, input.excludingId));
  }

  const [row] = await db
    .select({ id: pipelineSearchPresets.id })
    .from(pipelineSearchPresets)
    .where(and(...clauses))
    .limit(1);

  return Boolean(row);
}

async function getPipelineSearchPreset(
  id: string,
): Promise<PipelineSearchPreset | null> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const [row] = await db
    .select()
    .from(pipelineSearchPresets)
    .where(
      and(
        eq(pipelineSearchPresets.tenantId, tenantId),
        eq(pipelineSearchPresets.userId, userId),
        eq(pipelineSearchPresets.id, id),
      ),
    )
    .limit(1);

  return row ? mapRowToSearchPreset(row) : null;
}

import { randomUUID } from "node:crypto";
import type {
  PostApplicationIntegration,
  PostApplicationIntegrationStatus,
  PostApplicationProvider,
} from "@shared/types";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";

const { postApplicationIntegrations } = schema;

type IntegrationCredentials = Record<string, unknown>;

type UpsertConnectedIntegrationInput = {
  provider: PostApplicationProvider;
  accountKey: string;
  displayName?: string | null;
  credentials: IntegrationCredentials;
};

type UpdatePostApplicationIntegrationSyncStateInput = {
  provider: PostApplicationProvider;
  accountKey: string;
  lastSyncedAt?: number | null;
  lastError?: string | null;
  credentials?: IntegrationCredentials | null;
  status?: PostApplicationIntegrationStatus;
};

function asCredentials(value: unknown): IntegrationCredentials | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as IntegrationCredentials;
}

function mapRowToIntegration(
  row: typeof postApplicationIntegrations.$inferSelect,
): PostApplicationIntegration {
  return {
    id: row.id,
    provider: row.provider,
    accountKey: row.accountKey,
    displayName: row.displayName,
    status: row.status as PostApplicationIntegrationStatus,
    credentials: asCredentials(row.credentials),
    lastConnectedAt: row.lastConnectedAt,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getPostApplicationIntegration(
  provider: PostApplicationProvider,
  accountKey: string,
): Promise<PostApplicationIntegration | null> {
  const [row] = await db
    .select()
    .from(postApplicationIntegrations)
    .where(
      and(
        eq(postApplicationIntegrations.provider, provider),
        eq(postApplicationIntegrations.accountKey, accountKey),
      ),
    );

  return row ? mapRowToIntegration(row) : null;
}

export async function upsertConnectedPostApplicationIntegration(
  input: UpsertConnectedIntegrationInput,
): Promise<PostApplicationIntegration> {
  const nowEpoch = Date.now();
  const nowIso = new Date(nowEpoch).toISOString();
  const existing = await getPostApplicationIntegration(
    input.provider,
    input.accountKey,
  );

  if (existing) {
    await db
      .update(postApplicationIntegrations)
      .set({
        displayName: input.displayName ?? existing.displayName,
        status: "connected",
        credentials: input.credentials,
        lastConnectedAt: nowEpoch,
        lastError: null,
        updatedAt: nowIso,
      })
      .where(eq(postApplicationIntegrations.id, existing.id));

    const updated = await getPostApplicationIntegration(
      input.provider,
      input.accountKey,
    );
    if (!updated) {
      throw new Error(
        `Failed to load updated integration ${input.provider}/${input.accountKey}.`,
      );
    }
    return updated;
  }

  const id = randomUUID();
  await db.insert(postApplicationIntegrations).values({
    id,
    provider: input.provider,
    accountKey: input.accountKey,
    displayName: input.displayName ?? null,
    status: "connected",
    credentials: input.credentials,
    lastConnectedAt: nowEpoch,
    lastError: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const created = await getPostApplicationIntegration(
    input.provider,
    input.accountKey,
  );
  if (!created) {
    throw new Error(
      `Failed to load created integration ${input.provider}/${input.accountKey}.`,
    );
  }
  return created;
}

export async function disconnectPostApplicationIntegration(
  provider: PostApplicationProvider,
  accountKey: string,
): Promise<PostApplicationIntegration | null> {
  const existing = await getPostApplicationIntegration(provider, accountKey);
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  await db
    .update(postApplicationIntegrations)
    .set({
      status: "disconnected",
      credentials: null,
      lastError: null,
      updatedAt: nowIso,
    })
    .where(eq(postApplicationIntegrations.id, existing.id));

  return getPostApplicationIntegration(provider, accountKey);
}

export async function updatePostApplicationIntegrationSyncState(
  input: UpdatePostApplicationIntegrationSyncStateInput,
): Promise<PostApplicationIntegration | null> {
  const existing = await getPostApplicationIntegration(
    input.provider,
    input.accountKey,
  );
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  await db
    .update(postApplicationIntegrations)
    .set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.lastSyncedAt !== undefined
        ? { lastSyncedAt: input.lastSyncedAt }
        : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      ...(input.credentials !== undefined
        ? { credentials: input.credentials }
        : {}),
      updatedAt: nowIso,
    })
    .where(eq(postApplicationIntegrations.id, existing.id));

  return getPostApplicationIntegration(input.provider, input.accountKey);
}

import { randomUUID } from "node:crypto";
import { getUserId } from "@server/infra/request-context";
import type {
  UpdateWatchlistSelectionsInput,
  WatchlistJobState,
  WatchlistSelectedSource,
} from "@shared/types";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { watchlistJobStates, watchlistSelectedSources } = schema;

function requireActiveUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new Error("User context is required for watchlist source selections");
  }
  return userId;
}

function mapRowToWatchlistJobState(
  row: typeof watchlistJobStates.$inferSelect,
): WatchlistJobState {
  return {
    source: row.source,
    sourceJobId: row.sourceJobId,
    state: row.state,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRowToWatchlistSelectedSource(
  row: typeof watchlistSelectedSources.$inferSelect,
): WatchlistSelectedSource {
  return {
    id: row.id,
    catalogSourceId: row.catalogSourceId,
    label: row.label,
    careersUrl: row.careersUrl,
    cxsJobsUrl: row.cxsJobsUrl,
    sourceType: row.sourceType,
    isCustom: row.isCustom,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listWatchlistSelectedSources(): Promise<
  WatchlistSelectedSource[]
> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const rows = await db
    .select()
    .from(watchlistSelectedSources)
    .where(
      and(
        eq(watchlistSelectedSources.tenantId, tenantId),
        eq(watchlistSelectedSources.userId, userId),
      ),
    )
    .orderBy(asc(watchlistSelectedSources.sortOrder));

  return rows.map(mapRowToWatchlistSelectedSource);
}

export async function replaceWatchlistSelectedSources(
  input: UpdateWatchlistSelectionsInput,
): Promise<WatchlistSelectedSource[]> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.delete(watchlistSelectedSources)
      .where(
        and(
          eq(watchlistSelectedSources.tenantId, tenantId),
          eq(watchlistSelectedSources.userId, userId),
        ),
      )
      .run();

    if (input.selections.length === 0) {
      return;
    }

    tx.insert(watchlistSelectedSources)
      .values(
        input.selections.map((selection, index) => ({
          id: randomUUID(),
          tenantId,
          userId,
          catalogSourceId: selection.catalogSourceId ?? null,
          label: selection.label?.trim() || selection.careersUrl,
          careersUrl: selection.careersUrl,
          cxsJobsUrl: null,
          sourceType: selection.sourceType,
          isCustom: !selection.catalogSourceId,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
  });

  return listWatchlistSelectedSources();
}

export async function listWatchlistJobStates(): Promise<WatchlistJobState[]> {
  const rows = await db
    .select()
    .from(watchlistJobStates)
    .where(eq(watchlistJobStates.tenantId, getActiveTenantId()));

  return rows.map(mapRowToWatchlistJobState);
}

export async function setWatchlistJobState(input: {
  source: string;
  sourceJobId: string;
  state: WatchlistJobState["state"];
}): Promise<WatchlistJobState> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();

  const [existing] = await db
    .select({ id: watchlistJobStates.id })
    .from(watchlistJobStates)
    .where(
      and(
        eq(watchlistJobStates.tenantId, tenantId),
        eq(watchlistJobStates.source, input.source),
        eq(watchlistJobStates.sourceJobId, input.sourceJobId),
      ),
    );

  if (existing) {
    await db
      .update(watchlistJobStates)
      .set({ state: input.state, updatedAt: now })
      .where(
        and(
          eq(watchlistJobStates.tenantId, tenantId),
          eq(watchlistJobStates.id, existing.id),
        ),
      );
  } else {
    await db.insert(watchlistJobStates).values({
      id: randomUUID(),
      tenantId,
      source: input.source,
      sourceJobId: input.sourceJobId,
      state: input.state,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [row] = await db
    .select()
    .from(watchlistJobStates)
    .where(
      and(
        eq(watchlistJobStates.tenantId, tenantId),
        eq(watchlistJobStates.source, input.source),
        eq(watchlistJobStates.sourceJobId, input.sourceJobId),
      ),
    );

  if (!row) {
    throw new Error("Failed to retrieve watchlist job state");
  }
  return mapRowToWatchlistJobState(row);
}

export async function clearWatchlistJobState(input: {
  source: string;
  sourceJobId: string;
}): Promise<number> {
  const result = await db
    .delete(watchlistJobStates)
    .where(
      and(
        eq(watchlistJobStates.tenantId, getActiveTenantId()),
        eq(watchlistJobStates.source, input.source),
        eq(watchlistJobStates.sourceJobId, input.sourceJobId),
      ),
    );

  return result.changes;
}

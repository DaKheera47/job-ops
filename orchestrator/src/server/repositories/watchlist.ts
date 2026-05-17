import { randomUUID } from "node:crypto";
import type { WatchlistJobState } from "@shared/types";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { watchlistJobStates } = schema;

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

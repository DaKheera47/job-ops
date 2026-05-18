import { randomUUID } from "node:crypto";
import { getUserId } from "@server/infra/request-context";
import type {
  UpdateWatchlistSelectionsInput,
  WatchlistCheckInput,
  WatchlistCheckResponse,
  WatchlistJobState,
  WatchlistSelectedSource,
} from "@shared/types";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const {
  watchlistChecks,
  watchlistJobStates,
  watchlistSeenJobs,
  watchlistSelectedSources,
} = schema;

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
  const userId = requireActiveUserId();
  const rows = await db
    .select()
    .from(watchlistJobStates)
    .where(
      and(
        eq(watchlistJobStates.tenantId, getActiveTenantId()),
        eq(watchlistJobStates.userId, userId),
      ),
    );

  return rows.map(mapRowToWatchlistJobState);
}

export async function setWatchlistJobState(input: {
  source: string;
  sourceJobId: string;
  state: WatchlistJobState["state"];
}): Promise<WatchlistJobState> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const now = new Date().toISOString();

  const [existing] = await db
    .select({ id: watchlistJobStates.id })
    .from(watchlistJobStates)
    .where(
      and(
        eq(watchlistJobStates.tenantId, tenantId),
        eq(watchlistJobStates.userId, userId),
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
      userId,
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
        eq(watchlistJobStates.userId, userId),
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
  const userId = requireActiveUserId();
  const result = await db
    .delete(watchlistJobStates)
    .where(
      and(
        eq(watchlistJobStates.tenantId, getActiveTenantId()),
        eq(watchlistJobStates.userId, userId),
        eq(watchlistJobStates.source, input.source),
        eq(watchlistJobStates.sourceJobId, input.sourceJobId),
      ),
    );

  return result.changes;
}

export async function recordWatchlistCheck(
  input: WatchlistCheckInput,
): Promise<WatchlistCheckResponse> {
  const tenantId = getActiveTenantId();
  const userId = requireActiveUserId();
  const now = new Date().toISOString();

  const normalizedChecks = input.checks
    .map((check) => ({
      source: String(check.source),
      sourceJobIds: Array.from(
        new Set(
          check.sourceJobIds
            .map((sourceJobId) => sourceJobId.trim())
            .filter(Boolean),
        ),
      ),
    }))
    .filter((check) => check.sourceJobIds.length > 0);

  return db.transaction(async (tx) => {
    const [existingCheckpoint] = await tx
      .select()
      .from(watchlistChecks)
      .where(
        and(
          eq(watchlistChecks.tenantId, tenantId),
          eq(watchlistChecks.userId, userId),
        ),
      );

    const previousLastCheckedAt = existingCheckpoint?.lastCheckedAt ?? null;
    const existingSeenRows = await Promise.all(
      normalizedChecks.map((check) =>
        tx
          .select()
          .from(watchlistSeenJobs)
          .where(
            and(
              eq(watchlistSeenJobs.tenantId, tenantId),
              eq(watchlistSeenJobs.userId, userId),
              eq(watchlistSeenJobs.source, check.source),
              inArray(watchlistSeenJobs.sourceJobId, check.sourceJobIds),
            ),
          ),
      ),
    );

    const existingSeenByKey = new Map<
      string,
      (typeof existingSeenRows)[number][number]
    >(
      existingSeenRows
        .flat()
        .map((row) => [`${row.source}:${row.sourceJobId}`, row] as const),
    );

    for (const check of normalizedChecks) {
      for (const sourceJobId of check.sourceJobIds) {
        const key = `${check.source}:${sourceJobId}`;
        const existing = existingSeenByKey.get(key);

        await tx
          .insert(watchlistSeenJobs)
          .values({
            id: existing?.id ?? randomUUID(),
            tenantId,
            userId,
            source: check.source,
            sourceJobId,
            firstSeenAt: existing?.firstSeenAt ?? now,
            lastSeenAt: now,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              watchlistSeenJobs.tenantId,
              watchlistSeenJobs.userId,
              watchlistSeenJobs.source,
              watchlistSeenJobs.sourceJobId,
            ],
            set: {
              lastSeenAt: now,
              updatedAt: now,
            },
          })
          .run();
      }
    }

    await tx
      .insert(watchlistChecks)
      .values({
        id: existingCheckpoint?.id ?? randomUUID(),
        tenantId,
        userId,
        lastCheckedAt: now,
        createdAt: existingCheckpoint?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [watchlistChecks.tenantId, watchlistChecks.userId],
        set: {
          lastCheckedAt: now,
          updatedAt: now,
        },
      })
      .run();

    const jobs = normalizedChecks.flatMap((check) =>
      check.sourceJobIds.map((sourceJobId) => {
        const existing = existingSeenByKey.get(`${check.source}:${sourceJobId}`);
        const firstSeenAt = existing?.firstSeenAt ?? now;
        return {
          source: check.source,
          sourceJobId,
          isNewSinceLastCheck:
            previousLastCheckedAt !== null && existing === undefined,
          firstSeenAt,
          lastSeenAt: now,
        };
      }),
    );

    return {
      previousLastCheckedAt,
      checkedAt: now,
      jobs,
    };
  });
}

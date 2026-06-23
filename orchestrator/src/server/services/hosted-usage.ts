import { randomUUID } from "node:crypto";
import { badRequest, notFound, unprocessableEntity } from "@infra/errors";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { db, schema } from "@server/db";
import { getPrivateDataScope } from "@server/tenancy/private-scope";
import {
  HOSTED_USAGE_ACTIONS,
  type HostedUsageAction,
  type HostedUsageActionSummary,
  type HostedUsageSummary,
} from "@shared/types";
import { and, eq } from "drizzle-orm";

const { hostedUsageCounters, hostedUsageReservations } = schema;

export const DEFAULT_HOSTED_MONTHLY_LIMITS: Record<HostedUsageAction, number> =
  {
    job_search: 100,
    pipeline_run: 25,
    tailoring: 250,
    ghostwriter: 250,
    pdf_export: 250,
  };

type UsageScope = {
  tenantId: string;
  userId: string;
};

type AllowanceSnapshot = {
  quotasEnabled: boolean;
  action: HostedUsageAction;
  period: string;
  requestedUnits: number;
  limitUnits: number | null;
  usedUnits: number;
  reservedUnits: number;
  availableUnits: number | null;
};

type UsageCounterRow = typeof hostedUsageCounters.$inferSelect;
type UsageReservationRow = typeof hostedUsageReservations.$inferSelect;
type UsageTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type HostedUsageReservation = {
  id: string;
  tenantId: string;
  userId: string;
  period: string;
  action: HostedUsageAction;
  reservedUnits: number;
  usedUnits: number;
  refundedUnits: number;
  status: "reserved" | "settled" | "refunded";
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HostedUsageReservationResult = {
  allowance: AllowanceSnapshot;
  reservation: HostedUsageReservation | null;
};

export type HostedUsageReservationWorkResult<T> = {
  result: T;
  usedUnits?: number;
};

function isHostedQuotaModeEnabled(): boolean {
  const config = getJobOpsAppConfig();
  return config.appMode === "hosted" && config.capabilities.quotas;
}

function isHostedAppMode(): boolean {
  return getJobOpsAppConfig().appMode === "hosted";
}

export function getHostedUsagePeriod(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function assertPositiveUnits(units: number): number {
  if (!Number.isInteger(units) || units < 1) {
    throw badRequest("Usage units must be a positive integer");
  }
  return units;
}

function assertNonNegativeUnits(units: number): number {
  if (!Number.isInteger(units) || units < 0) {
    throw badRequest("Usage units must be a non-negative integer");
  }
  return units;
}

function getHostedUsageScope(): UsageScope {
  const scope = getPrivateDataScope();
  if (!scope.userId) {
    throw badRequest("Hosted usage requires authenticated user context");
  }
  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
  };
}

function getHostedReservationMutationScope(): UsageScope | null {
  return isHostedAppMode() ? getHostedUsageScope() : null;
}

function toAllowanceSnapshot(args: {
  quotasEnabled: boolean;
  action: HostedUsageAction;
  period: string;
  requestedUnits: number;
  limitUnits: number | null;
  usedUnits: number;
  reservedUnits: number;
}): AllowanceSnapshot {
  const availableUnits =
    args.limitUnits === null
      ? null
      : Math.max(0, args.limitUnits - args.usedUnits - args.reservedUnits);
  return { ...args, availableUnits };
}

function toReservation(row: UsageReservationRow): HostedUsageReservation {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    period: row.period,
    action: row.action,
    reservedUnits: row.reservedUnits,
    usedUnits: row.usedUnits,
    refundedUnits: row.refundedUnits,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function noOpAllowance(
  action: HostedUsageAction,
  units: number,
  now?: Date,
): AllowanceSnapshot {
  return toAllowanceSnapshot({
    quotasEnabled: false,
    action,
    period: getHostedUsagePeriod(now),
    requestedUnits: units,
    limitUnits: null,
    usedUnits: 0,
    reservedUnits: 0,
  });
}

function counterFilter(args: {
  tenantId: string;
  userId: string;
  period: string;
  action: HostedUsageAction;
}) {
  return and(
    eq(hostedUsageCounters.tenantId, args.tenantId),
    eq(hostedUsageCounters.userId, args.userId),
    eq(hostedUsageCounters.period, args.period),
    eq(hostedUsageCounters.action, args.action),
  );
}

function getCounter(
  tx: UsageTransaction,
  args: {
    tenantId: string;
    userId: string;
    period: string;
    action: HostedUsageAction;
  },
): UsageCounterRow | null {
  return (
    tx
      .select()
      .from(hostedUsageCounters)
      .where(counterFilter(args))
      .limit(1)
      .get() ?? null
  );
}

function ensureCounter(
  tx: UsageTransaction,
  args: {
    tenantId: string;
    userId: string;
    period: string;
    action: HostedUsageAction;
  },
): UsageCounterRow {
  const limitUnits = DEFAULT_HOSTED_MONTHLY_LIMITS[args.action];
  const now = new Date().toISOString();

  tx.insert(hostedUsageCounters)
    .values({
      id: randomUUID(),
      tenantId: args.tenantId,
      userId: args.userId,
      period: args.period,
      action: args.action,
      limitUnits,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();

  const counter = getCounter(tx, args);
  if (!counter) {
    throw new Error("Failed to load hosted usage counter");
  }

  if (counter.limitUnits !== limitUnits) {
    tx.update(hostedUsageCounters)
      .set({ limitUnits, updatedAt: now })
      .where(eq(hostedUsageCounters.id, counter.id))
      .run();
    return { ...counter, limitUnits, updatedAt: now };
  }

  return counter;
}

function assertAllowance(args: {
  counter: UsageCounterRow;
  action: HostedUsageAction;
  period: string;
  requestedUnits: number;
}): AllowanceSnapshot {
  const snapshot = toAllowanceSnapshot({
    quotasEnabled: true,
    action: args.action,
    period: args.period,
    requestedUnits: args.requestedUnits,
    limitUnits: args.counter.limitUnits,
    usedUnits: args.counter.usedUnits,
    reservedUnits: args.counter.reservedUnits,
  });

  if (
    snapshot.availableUnits !== null &&
    args.requestedUnits > snapshot.availableUnits
  ) {
    throw unprocessableEntity("Monthly usage quota exceeded", {
      action: args.action,
      period: args.period,
      limit: args.counter.limitUnits,
      used: args.counter.usedUnits,
      reserved: args.counter.reservedUnits,
      requested: args.requestedUnits,
    });
  }

  return snapshot;
}

function getReservationById(
  tx: UsageTransaction,
  reservationId: string,
  scope?: UsageScope | null,
): UsageReservationRow | null {
  const predicate = scope
    ? and(
        eq(hostedUsageReservations.id, reservationId),
        eq(hostedUsageReservations.tenantId, scope.tenantId),
        eq(hostedUsageReservations.userId, scope.userId),
      )
    : eq(hostedUsageReservations.id, reservationId);

  return (
    tx.select().from(hostedUsageReservations).where(predicate).limit(1).get() ??
    null
  );
}

function getReservationByIdempotencyKey(
  tx: UsageTransaction,
  args: {
    tenantId: string;
    userId: string;
    period: string;
    action: HostedUsageAction;
    idempotencyKey: string;
  },
): UsageReservationRow | null {
  return (
    tx
      .select()
      .from(hostedUsageReservations)
      .where(
        and(
          eq(hostedUsageReservations.tenantId, args.tenantId),
          eq(hostedUsageReservations.userId, args.userId),
          eq(hostedUsageReservations.period, args.period),
          eq(hostedUsageReservations.action, args.action),
          eq(hostedUsageReservations.idempotencyKey, args.idempotencyKey),
        ),
      )
      .limit(1)
      .get() ?? null
  );
}

function applyCounterDeltas(
  tx: UsageTransaction,
  counter: UsageCounterRow,
  deltas: { usedUnits?: number; reservedUnits?: number },
): UsageCounterRow {
  const usedUnits = counter.usedUnits + (deltas.usedUnits ?? 0);
  const reservedUnits = counter.reservedUnits + (deltas.reservedUnits ?? 0);
  if (usedUnits < 0 || reservedUnits < 0) {
    throw new Error("Hosted usage counter cannot be negative");
  }

  const updatedAt = new Date().toISOString();
  tx.update(hostedUsageCounters)
    .set({ usedUnits, reservedUnits, updatedAt })
    .where(eq(hostedUsageCounters.id, counter.id))
    .run();

  return { ...counter, usedUnits, reservedUnits, updatedAt };
}

export async function getHostedUsageSummary(
  now: Date = new Date(),
): Promise<HostedUsageSummary> {
  const period = getHostedUsagePeriod(now);
  if (!isHostedQuotaModeEnabled()) {
    return {
      tenantId: null,
      userId: null,
      period,
      quotasEnabled: false,
      actions: [],
    };
  }

  const scope = getHostedUsageScope();
  const rows = await db
    .select()
    .from(hostedUsageCounters)
    .where(
      and(
        eq(hostedUsageCounters.tenantId, scope.tenantId),
        eq(hostedUsageCounters.userId, scope.userId),
        eq(hostedUsageCounters.period, period),
      ),
    );
  const rowByAction = new Map(rows.map((row) => [row.action, row]));
  const actions: HostedUsageActionSummary[] = HOSTED_USAGE_ACTIONS.map(
    (action) => {
      const row = rowByAction.get(action);
      const limitUnits = DEFAULT_HOSTED_MONTHLY_LIMITS[action];
      const usedUnits = row?.usedUnits ?? 0;
      const reservedUnits = row?.reservedUnits ?? 0;
      return {
        action,
        period,
        usedUnits,
        reservedUnits,
        limitUnits,
        availableUnits: Math.max(0, limitUnits - usedUnits - reservedUnits),
      };
    },
  );

  return {
    tenantId: scope.tenantId,
    userId: scope.userId,
    period,
    quotasEnabled: true,
    actions,
  };
}

export async function requireHostedUsageAllowance(args: {
  action: HostedUsageAction;
  units?: number;
  now?: Date;
}): Promise<AllowanceSnapshot> {
  const units = assertPositiveUnits(args.units ?? 1);
  if (!isHostedQuotaModeEnabled()) {
    return noOpAllowance(args.action, units, args.now);
  }

  const scope = getHostedUsageScope();
  const period = getHostedUsagePeriod(args.now);

  return db.transaction((tx) => {
    const counter = ensureCounter(tx, {
      ...scope,
      period,
      action: args.action,
    });
    return assertAllowance({
      counter,
      action: args.action,
      period,
      requestedUnits: units,
    });
  });
}

export async function consumeHostedUsage(args: {
  action: HostedUsageAction;
  units?: number;
  now?: Date;
}): Promise<AllowanceSnapshot> {
  const units = assertPositiveUnits(args.units ?? 1);
  if (!isHostedQuotaModeEnabled()) {
    return noOpAllowance(args.action, units, args.now);
  }

  const scope = getHostedUsageScope();
  const period = getHostedUsagePeriod(args.now);

  return db.transaction((tx) => {
    const counter = ensureCounter(tx, {
      ...scope,
      period,
      action: args.action,
    });
    const before = assertAllowance({
      counter,
      action: args.action,
      period,
      requestedUnits: units,
    });
    applyCounterDeltas(tx, counter, { usedUnits: units });
    return before;
  });
}

export async function reserveHostedUsage(args: {
  action: HostedUsageAction;
  units?: number;
  idempotencyKey?: string | null;
  now?: Date;
}): Promise<HostedUsageReservationResult> {
  const units = assertPositiveUnits(args.units ?? 1);
  if (!isHostedQuotaModeEnabled()) {
    return {
      allowance: noOpAllowance(args.action, units, args.now),
      reservation: null,
    };
  }

  const scope = getHostedUsageScope();
  const period = getHostedUsagePeriod(args.now);
  const idempotencyKey = args.idempotencyKey?.trim() || null;

  return db.transaction((tx) => {
    if (idempotencyKey) {
      const existing = getReservationByIdempotencyKey(tx, {
        ...scope,
        period,
        action: args.action,
        idempotencyKey,
      });
      if (existing) {
        const counter = ensureCounter(tx, {
          ...scope,
          period,
          action: args.action,
        });
        return {
          allowance: toAllowanceSnapshot({
            quotasEnabled: true,
            action: args.action,
            period,
            requestedUnits: existing.reservedUnits,
            limitUnits: counter.limitUnits,
            usedUnits: counter.usedUnits,
            reservedUnits: counter.reservedUnits,
          }),
          reservation: toReservation(existing),
        };
      }
    }

    const counter = ensureCounter(tx, {
      ...scope,
      period,
      action: args.action,
    });
    const before = assertAllowance({
      counter,
      action: args.action,
      period,
      requestedUnits: units,
    });
    applyCounterDeltas(tx, counter, { reservedUnits: units });

    const nowIso = new Date().toISOString();
    const reservationId = randomUUID();
    tx.insert(hostedUsageReservations)
      .values({
        id: reservationId,
        ...scope,
        period,
        action: args.action,
        reservedUnits: units,
        idempotencyKey,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .run();

    const reservation = getReservationById(tx, reservationId, scope);
    if (!reservation) {
      throw new Error("Failed to load hosted usage reservation");
    }
    return {
      allowance: before,
      reservation: toReservation(reservation),
    };
  });
}

export async function settleHostedUsageReservation(args: {
  reservationId: string;
  usedUnits: number;
}): Promise<HostedUsageReservation> {
  const usedUnits = assertNonNegativeUnits(args.usedUnits);
  const scope = getHostedReservationMutationScope();
  return db.transaction((tx) => {
    const reservation = getReservationById(tx, args.reservationId, scope);
    if (!reservation) {
      throw notFound("Hosted usage reservation not found");
    }
    if (usedUnits > reservation.reservedUnits) {
      throw badRequest("Used units cannot exceed reserved units");
    }
    if (reservation.status !== "reserved") {
      return toReservation(reservation);
    }

    const counter = ensureCounter(tx, {
      tenantId: reservation.tenantId,
      userId: reservation.userId,
      period: reservation.period,
      action: reservation.action,
    });
    applyCounterDeltas(tx, counter, {
      usedUnits,
      reservedUnits: -reservation.reservedUnits,
    });

    const refundedUnits = reservation.reservedUnits - usedUnits;
    const status = usedUnits > 0 ? "settled" : "refunded";
    const updatedAt = new Date().toISOString();
    tx.update(hostedUsageReservations)
      .set({
        usedUnits,
        refundedUnits,
        status,
        updatedAt,
      })
      .where(eq(hostedUsageReservations.id, reservation.id))
      .run();

    return {
      ...toReservation(reservation),
      usedUnits,
      refundedUnits,
      status,
      updatedAt,
    };
  });
}

export async function refundHostedUsageReservation(
  reservationId: string,
): Promise<HostedUsageReservation> {
  const scope = getHostedReservationMutationScope();
  return db.transaction((tx) => {
    const reservation = getReservationById(tx, reservationId, scope);
    if (!reservation) {
      throw notFound("Hosted usage reservation not found");
    }
    if (reservation.status !== "reserved") {
      return toReservation(reservation);
    }

    const counter = ensureCounter(tx, {
      tenantId: reservation.tenantId,
      userId: reservation.userId,
      period: reservation.period,
      action: reservation.action,
    });
    applyCounterDeltas(tx, counter, {
      reservedUnits: -reservation.reservedUnits,
    });

    const updatedAt = new Date().toISOString();
    tx.update(hostedUsageReservations)
      .set({
        usedUnits: 0,
        refundedUnits: reservation.reservedUnits,
        status: "refunded",
        updatedAt,
      })
      .where(eq(hostedUsageReservations.id, reservation.id))
      .run();

    return {
      ...toReservation(reservation),
      usedUnits: 0,
      refundedUnits: reservation.reservedUnits,
      status: "refunded",
      updatedAt,
    };
  });
}

export async function withHostedUsageReservation<T>(
  args: {
    action: HostedUsageAction;
    units?: number;
    idempotencyKey?: string | null;
    now?: Date;
  },
  work: () => Promise<HostedUsageReservationWorkResult<T>>,
): Promise<T> {
  const reserved = await reserveHostedUsage(args);
  const reservationId = reserved.reservation?.id;
  const reservedUnits = reserved.reservation?.reservedUnits ?? args.units ?? 1;

  try {
    const { result, usedUnits = reservedUnits } = await work();
    if (reservationId) {
      await settleHostedUsageReservation({
        reservationId,
        usedUnits: Math.min(Math.max(0, usedUnits), reservedUnits),
      });
    }
    return result;
  } catch (error) {
    if (reservationId) {
      try {
        await refundHostedUsageReservation(reservationId);
      } catch {
        // Preserve the original work failure. A later summary still exposes
        // the reserved units if refunding unexpectedly fails.
      }
    }
    throw error;
  }
}

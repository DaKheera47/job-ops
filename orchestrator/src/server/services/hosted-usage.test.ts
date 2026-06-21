import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("hosted usage service", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-hosted-usage-"));
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
      JOBOPS_TEST_AUTH_BYPASS: "0",
    };
    delete process.env.JOBOPS_APP_MODE;
    delete process.env.JOBOPS_HOSTED_QUOTAS_ENABLED;
    delete process.env.JOBOPS_HOSTED_SIGNUPS_ENABLED;
    delete process.env.JOBOPS_HOSTED_TENANT_ID;
    await import("@server/db/migrate");
    ({ closeDb } = await import("@server/db"));
  });

  afterEach(async () => {
    closeDb?.();
    closeDb = null;
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  async function usageRowCounts(): Promise<{
    counters: number;
    reservations: number;
  }> {
    const { db, schema } = await import("@server/db");
    const counters = await db.select().from(schema.hostedUsageCounters);
    const reservations = await db.select().from(schema.hostedUsageReservations);
    return { counters: counters.length, reservations: reservations.length };
  }

  async function createUser(id: string): Promise<void> {
    const { db, schema } = await import("@server/db");
    await db.insert(schema.users).values({
      id,
      username: id,
      displayName: id,
      passwordHash: "hash",
      passwordSalt: "salt",
    });
    await db.insert(schema.tenantMemberships).values({
      id: `membership-${id}`,
      userId: id,
      tenantId: "tenant_default",
      role: "member",
    });
  }

  async function withUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const { runWithRequestContext } = await import("@infra/request-context");
    return runWithRequestContext(
      {
        requestId: `req-${userId}`,
        tenantId: "tenant_default",
        userId,
        username: userId,
      },
      fn,
    );
  }

  function enableHostedQuotas(): void {
    process.env.JOBOPS_APP_MODE = "hosted";
    process.env.JOBOPS_HOSTED_TENANT_ID = "tenant_default";
    process.env.JOBOPS_HOSTED_QUOTAS_ENABLED = "true";
  }

  it("returns no-op allowance and writes no rows outside hosted quota mode", async () => {
    process.env.JOBOPS_HOSTED_QUOTAS_ENABLED = "true";
    const service = await import("./hosted-usage");

    const allowance = await service.consumeHostedUsage({
      action: "job_search",
      units: 3,
      now: new Date("2026-01-15T12:00:00.000Z"),
    });
    const summary = await service.getHostedUsageSummary(
      new Date("2026-01-15T12:00:00.000Z"),
    );

    expect(allowance).toMatchObject({
      quotasEnabled: false,
      action: "job_search",
      period: "2026-01",
      requestedUnits: 3,
      limitUnits: null,
      usedUnits: 0,
      reservedUnits: 0,
      availableUnits: null,
    });
    expect(summary).toEqual({
      tenantId: null,
      userId: null,
      period: "2026-01",
      quotasEnabled: false,
      actions: [],
    });
    await expect(usageRowCounts()).resolves.toEqual({
      counters: 0,
      reservations: 0,
    });
  });

  it("returns no-op allowance and writes no rows when hosted quotas are disabled", async () => {
    process.env.JOBOPS_APP_MODE = "hosted";
    process.env.JOBOPS_HOSTED_TENANT_ID = "tenant_default";
    process.env.JOBOPS_HOSTED_QUOTAS_ENABLED = "false";
    const service = await import("./hosted-usage");

    const allowance = await service.reserveHostedUsage({
      action: "pipeline_run",
      units: 2,
    });

    expect(allowance.reservation).toBeNull();
    expect(allowance.allowance.quotasEnabled).toBe(false);
    await expect(usageRowCounts()).resolves.toEqual({
      counters: 0,
      reservations: 0,
    });
  });

  it("increments hosted usage per authenticated user", async () => {
    enableHostedQuotas();
    await createUser("alice");
    const service = await import("./hosted-usage");

    await withUser("alice", async () => {
      await service.consumeHostedUsage({
        action: "job_search",
        units: 4,
        now: new Date("2026-02-01T00:00:00.000Z"),
      });
      await service.consumeHostedUsage({
        action: "job_search",
        units: 2,
        now: new Date("2026-02-15T00:00:00.000Z"),
      });
      const summary = await service.getHostedUsageSummary(
        new Date("2026-02-28T23:59:59.000Z"),
      );
      const search = summary.actions.find(
        (action) => action.action === "job_search",
      );

      expect(search).toMatchObject({
        period: "2026-02",
        usedUnits: 6,
        reservedUnits: 0,
        limitUnits: 100,
        availableUnits: 94,
      });
      await expect(usageRowCounts()).resolves.toEqual({
        counters: 1,
        reservations: 0,
      });
    });
  });

  it("isolates counters between hosted users in the same tenant", async () => {
    enableHostedQuotas();
    await createUser("alice");
    await createUser("bob");
    const service = await import("./hosted-usage");

    await withUser("alice", () =>
      service.consumeHostedUsage({ action: "tailoring", units: 7 }),
    );
    await withUser("bob", () =>
      service.consumeHostedUsage({ action: "tailoring", units: 2 }),
    );

    await withUser("alice", async () => {
      const summary = await service.getHostedUsageSummary();
      expect(
        summary.actions.find((action) => action.action === "tailoring"),
      ).toMatchObject({ usedUnits: 7, availableUnits: 243 });
    });
    await withUser("bob", async () => {
      const summary = await service.getHostedUsageSummary();
      expect(
        summary.actions.find((action) => action.action === "tailoring"),
      ).toMatchObject({ usedUnits: 2, availableUnits: 248 });
    });
  });

  it("reserves, settles, and refunds hosted usage", async () => {
    enableHostedQuotas();
    await createUser("alice");
    const service = await import("./hosted-usage");

    await withUser("alice", async () => {
      const reserved = await service.reserveHostedUsage({
        action: "ghostwriter",
        units: 10,
      });
      expect(reserved.reservation).toMatchObject({
        action: "ghostwriter",
        reservedUnits: 10,
        usedUnits: 0,
        refundedUnits: 0,
        status: "reserved",
      });

      let summary = await service.getHostedUsageSummary();
      expect(
        summary.actions.find((action) => action.action === "ghostwriter"),
      ).toMatchObject({ usedUnits: 0, reservedUnits: 10, availableUnits: 240 });

      const settled = await service.settleHostedUsageReservation({
        reservationId: reserved.reservation?.id ?? "",
        usedUnits: 6,
      });
      expect(settled).toMatchObject({
        usedUnits: 6,
        refundedUnits: 4,
        status: "settled",
      });

      summary = await service.getHostedUsageSummary();
      expect(
        summary.actions.find((action) => action.action === "ghostwriter"),
      ).toMatchObject({ usedUnits: 6, reservedUnits: 0, availableUnits: 244 });

      const second = await service.reserveHostedUsage({
        action: "ghostwriter",
        units: 5,
      });
      const refunded = await service.refundHostedUsageReservation(
        second.reservation?.id ?? "",
      );
      expect(refunded).toMatchObject({
        usedUnits: 0,
        refundedUnits: 5,
        status: "refunded",
      });

      summary = await service.getHostedUsageSummary();
      expect(
        summary.actions.find((action) => action.action === "ghostwriter"),
      ).toMatchObject({ usedUnits: 6, reservedUnits: 0, availableUnits: 244 });
    });
  });

  it("does not let another hosted user settle or refund a reservation", async () => {
    enableHostedQuotas();
    await createUser("alice");
    await createUser("bob");
    const service = await import("./hosted-usage");

    const reservationId = await withUser("alice", async () => {
      const reserved = await service.reserveHostedUsage({
        action: "ghostwriter",
        units: 10,
      });
      return reserved.reservation?.id ?? "";
    });

    await withUser("bob", async () => {
      await expect(
        service.settleHostedUsageReservation({
          reservationId,
          usedUnits: 1,
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
      await expect(
        service.refundHostedUsageReservation(reservationId),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
      });
    });

    await withUser("alice", async () => {
      const summary = await service.getHostedUsageSummary();
      expect(
        summary.actions.find((action) => action.action === "ghostwriter"),
      ).toMatchObject({ usedUnits: 0, reservedUnits: 10, availableUnits: 240 });
    });
  });

  it("throws a standard 422-compatible error when quota is exhausted", async () => {
    enableHostedQuotas();
    await createUser("alice");
    const service = await import("./hosted-usage");

    await withUser("alice", async () => {
      await service.consumeHostedUsage({ action: "pipeline_run", units: 25 });
      await expect(
        service.requireHostedUsageAllowance({
          action: "pipeline_run",
          units: 1,
        }),
      ).rejects.toMatchObject({
        status: 422,
        code: "UNPROCESSABLE_ENTITY",
        details: {
          action: "pipeline_run",
          limit: 25,
          used: 25,
          reserved: 0,
          requested: 1,
        },
      });
    });
  });

  it("uses separate UTC month periods", async () => {
    enableHostedQuotas();
    await createUser("alice");
    const service = await import("./hosted-usage");

    await withUser("alice", async () => {
      await service.consumeHostedUsage({
        action: "pdf_export",
        units: 3,
        now: new Date("2026-03-31T23:59:59.000Z"),
      });
      await service.consumeHostedUsage({
        action: "pdf_export",
        units: 1,
        now: new Date("2026-04-01T00:00:00.000Z"),
      });

      const march = await service.getHostedUsageSummary(
        new Date("2026-03-15T00:00:00.000Z"),
      );
      const april = await service.getHostedUsageSummary(
        new Date("2026-04-15T00:00:00.000Z"),
      );

      expect(
        march.actions.find((action) => action.action === "pdf_export"),
      ).toMatchObject({ period: "2026-03", usedUnits: 3 });
      expect(
        april.actions.find((action) => action.action === "pdf_export"),
      ).toMatchObject({ period: "2026-04", usedUnits: 1 });
    });
  });

  it("reuses idempotent reservations without double-reserving", async () => {
    enableHostedQuotas();
    await createUser("alice");
    const service = await import("./hosted-usage");

    await withUser("alice", async () => {
      const first = await service.reserveHostedUsage({
        action: "job_search",
        units: 3,
        idempotencyKey: "pipeline-run-1",
      });
      const second = await service.reserveHostedUsage({
        action: "job_search",
        units: 10,
        idempotencyKey: "pipeline-run-1",
      });

      expect(second.reservation?.id).toBe(first.reservation?.id);
      const summary = await service.getHostedUsageSummary();
      expect(
        summary.actions.find((action) => action.action === "job_search"),
      ).toMatchObject({ usedUnits: 0, reservedUnits: 3, availableUnits: 97 });
    });
  });
});

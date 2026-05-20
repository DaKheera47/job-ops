import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stale jobs cleanup invariant — load-bearing data-safety contract:
 *   • applied / in_progress / ready jobs are NEVER auto-deleted, regardless
 *     of how old `updatedAt` is.  These statuses represent user investment
 *     (tailored PDFs, sent applications, ongoing interviews) and must
 *     persist until the user removes them explicitly.
 *   • discovered / skipped / expired jobs older than the cutoff ARE removed,
 *     keeping the DB from growing unbounded.
 *
 * The previous regression that motivated this test was the May 2026 series
 * where cleanup paths started mass-deleting things they shouldn't.  Pinning
 * the invariant here means any agent that "simplifies" the WHERE clause
 * gets a red test instantly.
 */
describe.sequential("deleteStaleJobs invariant", () => {
  let tempDir: string;
  let db: Awaited<typeof import("../db/index")>["db"];
  let schema: Awaited<typeof import("../db/index")>["schema"];
  let jobsRepo: Awaited<typeof import("./jobs")>;

  const SAFE_STATUSES = ["applied", "in_progress", "ready"] as const;
  const PRUNABLE_STATUSES = ["discovered", "skipped", "expired"] as const;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-stale-jobs-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";

    await import("../db/migrate");
    ({ db, schema } = await import("../db/index"));
    jobsRepo = await import("./jobs");
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function seedJob(
    suffix: string,
    status: (typeof SAFE_STATUSES)[number] | (typeof PRUNABLE_STATUSES)[number],
    ageDays: number,
  ): Promise<string> {
    const created = await jobsRepo.createJob({
      source: "manual",
      title: `Job ${suffix}`,
      employer: "Acme",
      jobUrl: `https://example.com/job/${suffix}`,
    });
    const updatedAt = new Date(
      Date.now() - ageDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    await db
      .update(schema.jobs)
      .set({ status, updatedAt })
      .where(eq(schema.jobs.id, created.id));
    return created.id;
  }

  async function getStatusMap(ids: string[]): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {};
    for (const id of ids) {
      const row = await db
        .select({ id: schema.jobs.id, status: schema.jobs.status })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, id))
        .get();
      out[id] = row ? (row.status as string) : null;
    }
    return out;
  }

  it("preserves applied/in_progress/ready jobs even when ancient", async () => {
    const oldApplied = await seedJob("old-applied", "applied", 365);
    const oldInProgress = await seedJob("old-inprog", "in_progress", 365);
    const oldReady = await seedJob("old-ready", "ready", 365);

    // Seed prunable jobs so the function actually has work to do.
    const oldDiscovered = await seedJob("old-discovered", "discovered", 365);
    const oldSkipped = await seedJob("old-skipped", "skipped", 365);

    const deleted = await jobsRepo.deleteStaleJobs(90);

    const statuses = await getStatusMap([
      oldApplied,
      oldInProgress,
      oldReady,
      oldDiscovered,
      oldSkipped,
    ]);

    // The safe-statuses MUST still exist.
    expect(statuses[oldApplied]).toBe("applied");
    expect(statuses[oldInProgress]).toBe("in_progress");
    expect(statuses[oldReady]).toBe("ready");

    // Prunable ones gone.
    expect(statuses[oldDiscovered]).toBeNull();
    expect(statuses[oldSkipped]).toBeNull();

    // Returned count matches what was actually deleted.
    expect(deleted).toBe(2);
  });

  it("removes only prunable statuses older than the cutoff", async () => {
    const oldDiscovered = await seedJob("od", "discovered", 200);
    const oldSkipped = await seedJob("os", "skipped", 200);
    const oldExpired = await seedJob("oe", "expired", 200);
    const freshDiscovered = await seedJob("fd", "discovered", 1);
    const freshSkipped = await seedJob("fs", "skipped", 1);
    const freshExpired = await seedJob("fe", "expired", 1);

    const deleted = await jobsRepo.deleteStaleJobs(90);

    const statuses = await getStatusMap([
      oldDiscovered,
      oldSkipped,
      oldExpired,
      freshDiscovered,
      freshSkipped,
      freshExpired,
    ]);

    expect(statuses[oldDiscovered]).toBeNull();
    expect(statuses[oldSkipped]).toBeNull();
    expect(statuses[oldExpired]).toBeNull();
    expect(statuses[freshDiscovered]).toBe("discovered");
    expect(statuses[freshSkipped]).toBe("skipped");
    expect(statuses[freshExpired]).toBe("expired");

    expect(deleted).toBe(3);
  });

  it("respects the cutoff parameter", async () => {
    const ten = await seedJob("ten", "discovered", 10);
    const sixty = await seedJob("sixty", "discovered", 60);
    const hundred = await seedJob("hundred", "discovered", 100);

    // 90-day cutoff: only the 100-day-old job goes.
    const deleted90 = await jobsRepo.deleteStaleJobs(90);
    expect(deleted90).toBe(1);

    let statuses = await getStatusMap([ten, sixty, hundred]);
    expect(statuses[ten]).toBe("discovered");
    expect(statuses[sixty]).toBe("discovered");
    expect(statuses[hundred]).toBeNull();

    // 30-day cutoff: the 60-day-old one also goes.
    const deleted30 = await jobsRepo.deleteStaleJobs(30);
    expect(deleted30).toBe(1);

    statuses = await getStatusMap([ten, sixty]);
    expect(statuses[ten]).toBe("discovered");
    expect(statuses[sixty]).toBeNull();
  });

  it("returns 0 when nothing is stale", async () => {
    await seedJob("fresh", "discovered", 1);
    await seedJob("ancient-applied", "applied", 1000);

    const deleted = await jobsRepo.deleteStaleJobs(90);
    expect(deleted).toBe(0);
  });
});

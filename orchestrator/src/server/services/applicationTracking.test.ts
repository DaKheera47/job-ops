import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("Application Tracking Service", () => {
  let tempDir: string;
  let db: any;
  let schema: any;
  let applicationTracking: any;
  let jobsRepo: any;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-service-test-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";

    // Run migrations
    await import("../db/migrate.js");

    // Import modules after env is set
    const dbModule = await import("../db/index.js");
    db = dbModule.db;
    schema = dbModule.schema;

    applicationTracking = await import("./applicationTracking.js");
    jobsRepo = await import("../repositories/jobs.js");
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index.js");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("transitions stage and updates job status", async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "Test Developer",
      employer: "Tech Corp",
      jobUrl: "https://example.com/job/1",
    });

    // 1. Initial Transition (Applied)
    const event1 = applicationTracking.transitionStage(job.id, "applied");

    expect(event1.toStage).toBe("applied");

    // Check Job Status
    const jobAfter1 = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobAfter1?.status).toBe("applied");
    expect(jobAfter1?.appliedAt).toBeTruthy();

    // 2. Next Transition (Recruiter Screen)
    const event2 = applicationTracking.transitionStage(
      job.id,
      "recruiter_screen",
    );
    expect(event2.fromStage).toBe("applied");
    expect(event2.toStage).toBe("recruiter_screen");

    // Check Job Status (still applied for recruiter screen)
    const jobAfter2 = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobAfter2?.status).toBe("applied");
  });

  it("updates stage event and reflects in job status if latest", async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "Frontend Engineer",
      employer: "Web Co",
      jobUrl: "https://example.com/job/2",
    });

    const now = Math.floor(Date.now() / 1000);
    applicationTracking.transitionStage(job.id, "applied", now - 100);
    const event2 = applicationTracking.transitionStage(
      job.id,
      "recruiter_screen",
      now,
    );

    // Update event2 (latest) to 'offer'
    applicationTracking.updateStageEvent(event2.id, { toStage: "offer" });

    // Verify Event Updated
    const events = await applicationTracking.getStageEvents(job.id);
    const updatedEvent2 = events.find((e: any) => e.id === event2.id);
    expect(updatedEvent2?.toStage).toBe("offer");

    // Verify Job Status Updated
    const jobUpdated = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobUpdated?.status).toBe("applied"); // 'offer' maps to 'applied' in status (active)
    expect(jobUpdated?.outcome).toBe("offer_accepted");
  });

  it("deletes stage event and reverts job status", async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "Backend Engineer",
      employer: "Server Co",
      jobUrl: "https://example.com/job/3",
    });

    const now = Math.floor(Date.now() / 1000);
    applicationTracking.transitionStage(job.id, "applied", now - 100); // event1

    // Simulate UI sending outcome for rejection
    const event2 = applicationTracking.transitionStage(
      job.id,
      "closed",
      now,
      { reasonCode: "Skills" },
      "rejected",
    ); // event2

    // Verify job is closed/rejected
    let jobCheck = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobCheck?.status).toBe("applied");
    expect(jobCheck?.outcome).toBe("rejected");

    // Delete event2
    applicationTracking.deleteStageEvent(event2.id);

    // Verify job status reverted to event1 (applied)
    jobCheck = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobCheck?.status).toBe("applied");
    expect(jobCheck?.outcome).toBeNull();
  });

  it('handles "no_change" transitions (notes)', async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "DevOps",
      employer: "Cloud Inc",
      jobUrl: "https://example.com/job/4",
    });

    applicationTracking.transitionStage(job.id, "applied");
    const noteEvent = applicationTracking.transitionStage(
      job.id,
      "no_change",
      undefined,
      {
        note: "Just checking in",
      },
    );

    expect(noteEvent.toStage).toBe("applied");

    const events = await applicationTracking.getStageEvents(job.id);
    expect(events).toHaveLength(2);
    expect(events[1].metadata?.note).toBe("Just checking in");
  });

  it("updates closedAt when outcome changes via event update/delete", async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "QA Engineer",
      employer: "Test Labs",
      jobUrl: "https://example.com/job/5",
    });

    const now = Math.floor(Date.now() / 1000);
    applicationTracking.transitionStage(job.id, "applied", now - 100);
    const event2 = applicationTracking.transitionStage(
      job.id,
      "closed",
      now,
      { reasonCode: "Other" },
      "rejected",
    );

    let jobCheck = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobCheck?.outcome).toBe("rejected");
    expect(jobCheck?.closedAt).toBe(now);

    // 1. Update event2 to not be a closure
    applicationTracking.updateStageEvent(event2.id, {
      toStage: "technical_interview",
    });
    jobCheck = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobCheck?.outcome).toBeNull();
    expect(jobCheck?.closedAt).toBeNull();

    // 2. Update event2 back to a closure
    applicationTracking.updateStageEvent(event2.id, { toStage: "offer" });
    jobCheck = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobCheck?.outcome).toBe("offer_accepted");
    expect(jobCheck?.closedAt).toBe(now);

    // 3. Delete the closure event
    applicationTracking.deleteStageEvent(event2.id);
    jobCheck = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobCheck?.outcome).toBeNull();
    expect(jobCheck?.closedAt).toBeNull();
  });

  it("preserves explicit outcome when updating metadata", async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "Support Engineer",
      employer: "Helpdesk Co",
      jobUrl: "https://example.com/job/6",
    });

    const now = Math.floor(Date.now() / 1000);
    applicationTracking.transitionStage(job.id, "applied", now - 100);
    const closedEvent = applicationTracking.transitionStage(
      job.id,
      "closed",
      now,
      { reasonCode: "Other" },
      "withdrawn",
    );

    applicationTracking.updateStageEvent(closedEvent.id, {
      metadata: { note: "Withdrew after offer" },
    });

    const jobCheck = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.id))
      .get();
    expect(jobCheck?.outcome).toBe("withdrawn");
    expect(jobCheck?.closedAt).toBe(now);
  });
});

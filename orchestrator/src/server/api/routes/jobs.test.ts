import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Jobs API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("lists jobs and supports status filtering", async () => {
    const { createJob } = await import("../../repositories/jobs");
    const job = await createJob({
      source: "manual",
      title: "Test Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/1",
      jobDescription: "Test description",
    });

    const listRes = await fetch(`${baseUrl}/api/jobs`);
    const listBody = await listRes.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.data.total).toBe(1);
    expect(listBody.data.jobs[0].id).toBe(job.id);

    const filteredRes = await fetch(`${baseUrl}/api/jobs?status=skipped`);
    const filteredBody = await filteredRes.json();
    expect(filteredBody.data.total).toBe(0);
  });

  it("returns 404 for missing jobs", async () => {
    const res = await fetch(`${baseUrl}/api/jobs/missing-id`);
    expect(res.status).toBe(404);
  });

  it("validates job updates and supports skip/delete flow", async () => {
    const { createJob } = await import("../../repositories/jobs");
    const job = await createJob({
      source: "manual",
      title: "Test Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/2",
      jobDescription: "Test description",
    });

    const badRes = await fetch(`${baseUrl}/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suitabilityScore: 1000 }),
    });
    expect(badRes.status).toBe(400);

    const skipRes = await fetch(`${baseUrl}/api/jobs/${job.id}/skip`, {
      method: "POST",
    });
    const skipBody = await skipRes.json();
    expect(skipBody.data.status).toBe("skipped");

    const deleteRes = await fetch(`${baseUrl}/api/jobs/status/skipped`, {
      method: "DELETE",
    });
    const deleteBody = await deleteRes.json();
    expect(deleteBody.data.count).toBe(1);
  });

  it("applies a job and syncs to Notion", async () => {
    const { createNotionEntry } = await import("../../services/notion");
    vi.mocked(createNotionEntry).mockResolvedValue({
      success: true,
      pageId: "page-123",
    });

    const { createJob } = await import("../../repositories/jobs");
    const job = await createJob({
      source: "manual",
      title: "Test Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/3",
      jobDescription: "Test description",
    });

    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/apply`, {
      method: "POST",
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("applied");
    expect(body.data.notionPageId).toBe("page-123");
    expect(body.data.appliedAt).toBeTruthy();
    expect(createNotionEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: job.id,
        title: job.title,
        employer: job.employer,
      }),
    );
  });

  it("rescoring a job updates the suitability fields", async () => {
    const { createJob } = await import("../../repositories/jobs");
    const { scoreJobSuitability } = await import("../../services/scorer");
    const { getProfile } = await import("../../services/profile");

    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(scoreJobSuitability).mockResolvedValue({
      score: 77,
      reason: "Updated fit",
    });

    const job = await createJob({
      source: "manual",
      title: "Test Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/5",
      jobDescription: "Test description",
    });

    const { updateJob } = await import("../../repositories/jobs");
    await updateJob(job.id, {
      suitabilityScore: 55,
      suitabilityReason: "Old fit",
    });

    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/rescore`, {
      method: "POST",
    });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.suitabilityScore).toBe(77);
    expect(body.data.suitabilityReason).toBe("Updated fit");
  });

  it("checks visa sponsor status for a job", async () => {
    const { searchSponsors } = await import(
      "../../services/visa-sponsors/index"
    );
    vi.mocked(searchSponsors).mockReturnValue([
      {
        sponsor: { organisationName: "ACME CORP SPONSOR" } as any,
        score: 100,
        matchedName: "acme corp sponsor",
      },
    ]);

    const { createJob } = await import("../../repositories/jobs");
    const job = await createJob({
      source: "manual",
      title: "Sponsored Dev",
      employer: "Acme",
      jobUrl: "https://example.com/job/4",
    });

    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/check-sponsor`, {
      method: "POST",
    });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.sponsorMatchScore).toBe(100);
    expect(body.data.sponsorMatchNames).toContain("ACME CORP SPONSOR");
  });

  describe("Application Tracking", () => {
    let jobId: string;

    beforeEach(async () => {
      const { createJob } = await import("../../repositories/jobs");
      const job = await createJob({
        source: "manual",
        title: "Tracking Test",
        employer: "Test Corp",
        jobUrl: "https://example.com/tracking",
      });
      jobId = job.id;
    });

    it("transitions stages and retrieves events", async () => {
      // 1. Initial transition to applied
      const trans1 = await fetch(`${baseUrl}/api/jobs/${jobId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage: "applied" }),
      });
      const body1 = await trans1.json();
      expect(body1.ok).toBe(true);
      expect(body1.data.toStage).toBe("applied");
      const eventId = body1.data.id;

      // 2. Transition to recruiter_screen with metadata
      await fetch(`${baseUrl}/api/jobs/${jobId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStage: "recruiter_screen",
          metadata: { note: "Called by recruiter" },
        }),
      });

      // 3. Get events
      const eventsRes = await fetch(`${baseUrl}/api/jobs/${jobId}/events`);
      const eventsBody = await eventsRes.json();
      expect(eventsBody.ok).toBe(true);
      expect(eventsBody.data).toHaveLength(2);
      expect(eventsBody.data[0].toStage).toBe("applied");
      expect(eventsBody.data[1].toStage).toBe("recruiter_screen");
      expect(eventsBody.data[1].metadata.note).toBe("Called by recruiter");

      // 4. Patch an event
      const patchRes = await fetch(
        `${baseUrl}/api/jobs/${jobId}/events/${eventId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadata: { note: "Updated note" } }),
        },
      );
      expect(patchRes.status).toBe(200);

      const eventsRes2 = await fetch(`${baseUrl}/api/jobs/${jobId}/events`);
      const eventsBody2 = await eventsRes2.json();
      expect(eventsBody2.data[0].metadata.note).toBe("Updated note");

      // 5. Delete an event
      const deleteRes = await fetch(
        `${baseUrl}/api/jobs/${jobId}/events/${eventId}`,
        {
          method: "DELETE",
        },
      );
      expect(deleteRes.status).toBe(200);

      const eventsRes3 = await fetch(`${baseUrl}/api/jobs/${jobId}/events`);
      const eventsBody3 = await eventsRes3.json();
      expect(eventsBody3.data).toHaveLength(1);
    });

    it("manages application tasks", async () => {
      const { db, schema } = await import("../../db/index");
      const { eq } = await import("drizzle-orm");
      const { tasks } = schema;

      // 1. Initial state
      const res1 = await fetch(`${baseUrl}/api/jobs/${jobId}/tasks`);
      const body1 = await res1.json();
      expect(body1.ok).toBe(true);
      expect(body1.data).toEqual([]);

      // 2. Insert a task
      await (db as any)
        .insert(tasks)
        .values({
          id: "task-1",
          applicationId: jobId,
          type: "todo",
          title: "Complete test task",
          isCompleted: false,
        })
        .run();

      const res2 = await fetch(`${baseUrl}/api/jobs/${jobId}/tasks`);
      const body2 = await res2.json();
      expect(body2.data).toHaveLength(1);
      expect(body2.data[0].title).toBe("Complete test task");

      // 3. Test filtering (completed vs non-completed)
      await (db as any)
        .update(tasks)
        .set({ isCompleted: true })
        .where(eq(tasks.id, "task-1"))
        .run();

      const res3 = await fetch(`${baseUrl}/api/jobs/${jobId}/tasks`);
      const body3 = await res3.json();
      expect(body3.data).toHaveLength(0); // includeCompleted defaults to false

      const res4 = await fetch(
        `${baseUrl}/api/jobs/${jobId}/tasks?includeCompleted=true`,
      );
      const body4 = await res4.json();
      expect(body4.data).toHaveLength(1);
    });

    it("updates job outcome", async () => {
      const res = await fetch(`${baseUrl}/api/jobs/${jobId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: "rejected" }),
      });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.outcome).toBe("rejected");
      expect(body.data.closedAt).toBeTruthy();
    });
  });
});

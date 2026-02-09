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
    expect(typeof listBody.data.revision).toBe("string");

    const filteredRes = await fetch(`${baseUrl}/api/jobs?status=skipped`);
    const filteredBody = await filteredRes.json();
    expect(filteredBody.data.total).toBe(0);
    expect(typeof filteredBody.data.revision).toBe("string");
  });

  it("supports lightweight and full jobs list views", async () => {
    const { createJob } = await import("../../repositories/jobs");
    await createJob({
      source: "manual",
      title: "List View Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/list-view",
      jobDescription: "Heavy description that should not be in list mode",
    });

    const listRes = await fetch(`${baseUrl}/api/jobs?view=list`);
    const listBody = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listBody.ok).toBe(true);
    expect(typeof listBody.meta.requestId).toBe("string");
    expect(listBody.data.jobs[0].id).toBeTruthy();
    expect(listBody.data.jobs[0].title).toBe("List View Role");
    expect(listBody.data.jobs[0]).not.toHaveProperty("jobDescription");
    expect(typeof listBody.data.revision).toBe("string");

    const fullRes = await fetch(`${baseUrl}/api/jobs?view=full`);
    const fullBody = await fullRes.json();
    expect(fullRes.status).toBe(200);
    expect(fullBody.ok).toBe(true);
    expect(fullBody.data.jobs[0].title).toBe("List View Role");
    expect(fullBody.data.jobs[0]).toHaveProperty("jobDescription");
    expect(typeof fullBody.data.revision).toBe("string");

    const defaultRes = await fetch(`${baseUrl}/api/jobs`);
    const defaultBody = await defaultRes.json();
    expect(defaultRes.status).toBe(200);
    expect(defaultBody.ok).toBe(true);
    expect(defaultBody.data.jobs[0]).not.toHaveProperty("jobDescription");
    expect(typeof defaultBody.data.revision).toBe("string");
  });

  it("returns jobs revision and supports status filtering", async () => {
    const { createJob, updateJob } = await import("../../repositories/jobs");
    const readyJob = await createJob({
      source: "manual",
      title: "Ready Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/revision-ready",
      jobDescription: "Ready description",
    });
    const appliedJob = await createJob({
      source: "manual",
      title: "Applied Role",
      employer: "Beta",
      jobUrl: "https://example.com/job/revision-applied",
      jobDescription: "Applied description",
    });
    await updateJob(readyJob.id, { status: "ready" });
    await updateJob(appliedJob.id, { status: "applied" });

    const allRes = await fetch(`${baseUrl}/api/jobs/revision`);
    const allBody = await allRes.json();

    expect(allRes.status).toBe(200);
    expect(allBody.ok).toBe(true);
    expect(typeof allBody.meta.requestId).toBe("string");
    expect(typeof allBody.data.revision).toBe("string");
    expect(allBody.data.total).toBe(2);
    expect(allBody.data.latestUpdatedAt).toBeTruthy();
    expect(allBody.data.statusFilter).toBeNull();

    const filteredRes = await fetch(
      `${baseUrl}/api/jobs/revision?status=applied,ready`,
    );
    const filteredBody = await filteredRes.json();

    expect(filteredRes.status).toBe(200);
    expect(filteredBody.ok).toBe(true);
    expect(filteredBody.data.total).toBe(2);
    expect(filteredBody.data.statusFilter).toBe("applied,ready");
    expect(typeof filteredBody.data.revision).toBe("string");
  });

  it("rejects invalid jobs list view query", async () => {
    const res = await fetch(`${baseUrl}/api/jobs?view=compact`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("returns 404 for missing jobs", async () => {
    const res = await fetch(`${baseUrl}/api/jobs/missing-id`);
    expect(res.status).toBe(404);
  });

  it("updates core job detail fields", async () => {
    const { createJob } = await import("../../repositories/jobs");
    const job = await createJob({
      source: "manual",
      title: "Original Title",
      employer: "Original Employer",
      jobUrl: "https://example.com/job/core-fields",
      jobDescription: "Original description",
    });

    const res = await fetch(`${baseUrl}/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Updated Title",
        employer: "Updated Employer",
        jobUrl: "https://example.com/job/core-fields-updated",
        applicationLink: "https://example.com/apply/core-fields-updated",
        location: "London, UK",
        salary: "GBP 100k",
        deadline: "2026-03-31",
        jobDescription: "Updated description",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.title).toBe("Updated Title");
    expect(body.data.employer).toBe("Updated Employer");
    expect(body.data.jobUrl).toBe(
      "https://example.com/job/core-fields-updated",
    );
    expect(body.data.applicationLink).toBe(
      "https://example.com/apply/core-fields-updated",
    );
    expect(body.data.location).toBe("London, UK");
    expect(body.data.salary).toBe("GBP 100k");
    expect(body.data.deadline).toBe("2026-03-31");
    expect(body.data.jobDescription).toBe("Updated description");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("returns 404 when patching a missing job", async () => {
    const res = await fetch(`${baseUrl}/api/jobs/missing-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("returns 409 when patching to a duplicate job URL", async () => {
    const { createJob } = await import("../../repositories/jobs");
    const first = await createJob({
      source: "manual",
      title: "First",
      employer: "Acme",
      jobUrl: "https://example.com/job/first",
      jobDescription: "First description",
    });
    const second = await createJob({
      source: "manual",
      title: "Second",
      employer: "Acme",
      jobUrl: "https://example.com/job/second",
      jobDescription: "Second description",
    });

    const res = await fetch(`${baseUrl}/api/jobs/${second.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobUrl: first.jobUrl }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
    expect(typeof body.meta.requestId).toBe("string");
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
    const badBody = await badRes.json();
    expect(badRes.status).toBe(400);
    expect(badBody.ok).toBe(false);
    expect(badBody.error.code).toBe("INVALID_REQUEST");
    expect(typeof badBody.meta.requestId).toBe("string");

    const invalidCoreRes = await fetch(`${baseUrl}/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employer: "   " }),
    });
    const invalidCoreBody = await invalidCoreRes.json();
    expect(invalidCoreRes.status).toBe(400);
    expect(invalidCoreBody.ok).toBe(false);
    expect(invalidCoreBody.error.code).toBe("INVALID_REQUEST");
    expect(typeof invalidCoreBody.meta.requestId).toBe("string");

    const patchRes = await fetch(`${baseUrl}/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suitabilityScore: 77 }),
    });
    const patchBody = await patchRes.json();
    expect(patchRes.status).toBe(200);
    expect(patchBody.ok).toBe(true);
    expect(patchBody.data.suitabilityScore).toBe(77);
    expect(typeof patchBody.meta.requestId).toBe("string");

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

  it("runs bulk skip with partial failures", async () => {
    const { createJob } = await import("../../repositories/jobs");
    const discovered = await createJob({
      source: "manual",
      title: "Discovered Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/bulk-discovered",
      jobDescription: "Test description",
    });
    const ready = await createJob({
      source: "manual",
      title: "Ready Role",
      employer: "Beta",
      jobUrl: "https://example.com/job/bulk-ready",
      jobDescription: "Test description",
    });
    const applied = await createJob({
      source: "manual",
      title: "Applied Role",
      employer: "Gamma",
      jobUrl: "https://example.com/job/bulk-applied",
      jobDescription: "Test description",
    });
    const { updateJob } = await import("../../repositories/jobs");
    await updateJob(ready.id, { status: "ready" });
    await updateJob(applied.id, { status: "applied" });

    const res = await fetch(`${baseUrl}/api/jobs/bulk-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "skip",
        jobIds: [discovered.id, ready.id, applied.id, "missing-id"],
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.meta.requestId).toBeTruthy();
    expect(body.data.requested).toBe(4);
    expect(body.data.succeeded).toBe(2);
    expect(body.data.failed).toBe(2);
    const failures = body.data.results.filter((r: any) => !r.ok);
    expect(failures).toHaveLength(2);
    expect(failures.map((r: any) => r.error.code).sort()).toEqual([
      "INVALID_REQUEST",
      "NOT_FOUND",
    ]);
  });

  it("runs bulk move_to_ready and rejects ineligible statuses", async () => {
    const { createJob, updateJob } = await import("../../repositories/jobs");
    const discovered = await createJob({
      source: "manual",
      title: "New Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/bulk-ready-1",
      jobDescription: "Test description",
    });
    const ready = await createJob({
      source: "manual",
      title: "Already Ready",
      employer: "Acme",
      jobUrl: "https://example.com/job/bulk-ready-2",
      jobDescription: "Test description",
    });
    await updateJob(ready.id, { status: "ready" });
    const { processJob } = await import("../../pipeline/index");

    const res = await fetch(`${baseUrl}/api/jobs/bulk-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move_to_ready",
        jobIds: [discovered.id, ready.id],
      }),
    });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.succeeded).toBe(1);
    expect(body.data.failed).toBe(1);
    expect(vi.mocked(processJob)).toHaveBeenCalledWith(discovered.id);
    expect(
      body.data.results.find((r: any) => r.jobId === ready.id).error.code,
    ).toBe("INVALID_REQUEST");
  });

  it("runs bulk rescore with partial failures", async () => {
    const { createJob, updateJob } = await import("../../repositories/jobs");
    const { scoreJobSuitability } = await import("../../services/scorer");
    const { getProfile } = await import("../../services/profile");

    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(scoreJobSuitability).mockResolvedValue({
      score: 81,
      reason: "Updated fit from bulk rescore",
    });

    const discovered = await createJob({
      source: "manual",
      title: "Discovered Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/bulk-rescore-1",
      jobDescription: "Test description",
    });
    const ready = await createJob({
      source: "manual",
      title: "Ready Role",
      employer: "Beta",
      jobUrl: "https://example.com/job/bulk-rescore-2",
      jobDescription: "Test description",
    });
    const processing = await createJob({
      source: "manual",
      title: "Processing Role",
      employer: "Gamma",
      jobUrl: "https://example.com/job/bulk-rescore-3",
      jobDescription: "Test description",
    });
    await updateJob(ready.id, { status: "ready" });
    await updateJob(processing.id, { status: "processing" });

    const res = await fetch(`${baseUrl}/api/jobs/bulk-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rescore",
        jobIds: [discovered.id, ready.id, processing.id, "missing-id"],
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.meta.requestId).toBeTruthy();
    expect(body.data.requested).toBe(4);
    expect(body.data.succeeded).toBe(2);
    expect(body.data.failed).toBe(2);
    expect(
      body.data.results.find((r: any) => r.jobId === discovered.id).job
        .suitabilityScore,
    ).toBe(81);
    expect(
      body.data.results.find((r: any) => r.jobId === ready.id).job
        .suitabilityScore,
    ).toBe(81);
    expect(
      body.data.results.find((r: any) => r.jobId === processing.id).error.code,
    ).toBe("INVALID_REQUEST");
    expect(
      body.data.results.find((r: any) => r.jobId === "missing-id").error.code,
    ).toBe("NOT_FOUND");
  });

  it("validates bulk action payloads", async () => {
    const tooManyIds = Array.from(
      { length: 101 },
      (_, index) => `job-${index}`,
    );
    const res = await fetch(`${baseUrl}/api/jobs/bulk-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "skip",
        jobIds: tooManyIds,
      }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.meta.requestId).toBeTruthy();
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

  it("deletes jobs below a score threshold (excluding applied)", async () => {
    const { createJob, updateJob } = await import("../../repositories/jobs");

    // Create jobs with different scores and statuses
    const lowScoreJob = await createJob({
      source: "manual",
      title: "Low Score Job",
      employer: "Company A",
      jobUrl: "https://example.com/job/low",
      jobDescription: "Test description",
    });
    await updateJob(lowScoreJob.id, { suitabilityScore: 30 });

    const mediumScoreJob = await createJob({
      source: "manual",
      title: "Medium Score Job",
      employer: "Company B",
      jobUrl: "https://example.com/job/medium",
      jobDescription: "Test description",
    });
    await updateJob(mediumScoreJob.id, { suitabilityScore: 60 });

    const boundaryScoreJob = await createJob({
      source: "manual",
      title: "Boundary Score Job",
      employer: "Company Boundary",
      jobUrl: "https://example.com/job/boundary",
      jobDescription: "Test description",
    });
    await updateJob(boundaryScoreJob.id, { suitabilityScore: 50 });

    const highScoreJob = await createJob({
      source: "manual",
      title: "High Score Job",
      employer: "Company C",
      jobUrl: "https://example.com/job/high",
      jobDescription: "Test description",
    });
    await updateJob(highScoreJob.id, { suitabilityScore: 90 });

    const appliedLowScoreJob = await createJob({
      source: "manual",
      title: "Applied Low Score Job",
      employer: "Company D",
      jobUrl: "https://example.com/job/applied-low",
      jobDescription: "Test description",
    });
    await updateJob(appliedLowScoreJob.id, {
      suitabilityScore: 30,
      status: "applied",
    });

    // Delete jobs below score 50
    const deleteRes = await fetch(`${baseUrl}/api/jobs/score/50`, {
      method: "DELETE",
    });
    const deleteBody = await deleteRes.json();

    expect(deleteBody.ok).toBe(true);
    expect(deleteBody.data.count).toBe(1);
    expect(deleteBody.data.threshold).toBe(50);

    // Verify only the low score non-applied job was deleted
    const listRes = await fetch(`${baseUrl}/api/jobs`);
    const listBody = await listRes.json();

    const remainingJobIds = listBody.data.jobs.map((j: any) => j.id);
    expect(remainingJobIds).not.toContain(lowScoreJob.id);
    expect(remainingJobIds).toContain(boundaryScoreJob.id);
    expect(remainingJobIds).toContain(mediumScoreJob.id);
    expect(remainingJobIds).toContain(highScoreJob.id);
    expect(remainingJobIds).toContain(appliedLowScoreJob.id); // Applied job preserved
  });

  it("rejects invalid score thresholds", async () => {
    // Test invalid threshold (above 100)
    const invalidRes = await fetch(`${baseUrl}/api/jobs/score/150`, {
      method: "DELETE",
    });
    expect(invalidRes.status).toBe(400);
    const invalidBody = await invalidRes.json();
    expect(invalidBody.ok).toBe(false);
    expect(invalidBody.error.code).toBe("INVALID_REQUEST");

    // Test invalid threshold (below 0)
    const negativeRes = await fetch(`${baseUrl}/api/jobs/score/-10`, {
      method: "DELETE",
    });
    expect(negativeRes.status).toBe(400);

    // Test non-numeric threshold
    const nanRes = await fetch(`${baseUrl}/api/jobs/score/abc`, {
      method: "DELETE",
    });
    expect(nanRes.status).toBe(400);
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

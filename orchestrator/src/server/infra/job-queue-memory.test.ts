import { describe, expect, it } from "vitest";
import { InMemoryJobQueue } from "./job-queue-memory";

describe("InMemoryJobQueue", () => {
  it("enqueues auto pdf regeneration jobs", async () => {
    const queue = new InMemoryJobQueue();

    const result = await queue.enqueue("auto_pdf_regeneration", {
      jobId: "job-1",
      reason: "design_resume_updated",
      requestedAt: "2026-05-04T10:00:00.000Z",
      requestedBy: "system",
    });

    expect(result.queue).toBe("auto_pdf_regeneration");
    expect(result.deduplicated).toBe(false);
    expect(result.id).toBeTruthy();

    const jobs = queue.getQueuedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.payload.jobId).toBe("job-1");
  });

  it("deduplicates by queue and dedupe key", async () => {
    const queue = new InMemoryJobQueue();

    const first = await queue.enqueue(
      "auto_pdf_regeneration",
      {
        jobId: "job-1",
        reason: "tailoring_updated",
        requestedAt: "2026-05-04T10:00:00.000Z",
        requestedBy: "user",
      },
      { dedupeKey: "job-1:auto-pdf" },
    );

    const second = await queue.enqueue(
      "auto_pdf_regeneration",
      {
        jobId: "job-1",
        reason: "manual_refresh",
        requestedAt: "2026-05-04T10:01:00.000Z",
        requestedBy: "user",
      },
      { dedupeKey: "job-1:auto-pdf" },
    );

    expect(first.id).toBe(second.id);
    expect(second.deduplicated).toBe(true);
    expect(queue.getQueuedJobs()).toHaveLength(1);
  });
});

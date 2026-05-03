import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("jobs repository job notes", () => {
  let tempDir: string;
  let db: Awaited<typeof import("../db/index")>["db"];
  let schema: Awaited<typeof import("../db/index")>["schema"];
  let jobsRepo: Awaited<typeof import("./jobs")>;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-job-notes-repo-"));
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

  it("persists notes and orders them by updatedAt desc", async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "Backend Engineer",
      employer: "Acme",
      jobUrl: "https://example.com/job/repo-notes",
    });

    const first = await jobsRepo.createJobNote({
      jobId: job.id,
      title: "Why this company",
      content: "Mission and product fit.",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await jobsRepo.createJobNote({
      jobId: job.id,
      title: "Interview contacts",
      content: "Recruiter: Jamie Lee",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const updatedFirst = await jobsRepo.updateJobNote({
      jobId: job.id,
      noteId: first.id,
      title: "Why this company",
      content: "Mission, product fit, and growth opportunity.",
    });

    expect(updatedFirst).not.toBeNull();
    expect(updatedFirst?.updatedAt).not.toBe(first.updatedAt);

    const notes = await jobsRepo.listJobNotes(job.id);

    expect(notes.map((note) => note.id)).toEqual([first.id, second.id]);
    expect(notes[0]?.content).toContain("growth opportunity");
  });

  it("lists only requested notes for a job", async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "Backend Engineer",
      employer: "Acme",
      jobUrl: "https://example.com/job/repo-notes-by-id",
    });
    const otherJob = await jobsRepo.createJob({
      source: "manual",
      title: "Frontend Engineer",
      employer: "Beta",
      jobUrl: "https://example.com/job/repo-other-notes-by-id",
    });

    const selected = await jobsRepo.createJobNote({
      jobId: job.id,
      title: "Selected",
      content: "Use this one.",
    });
    await jobsRepo.createJobNote({
      jobId: job.id,
      title: "Unselected",
      content: "Do not use this one.",
    });
    const otherJobNote = await jobsRepo.createJobNote({
      jobId: otherJob.id,
      title: "Other job",
      content: "Wrong job.",
    });

    const notes = await jobsRepo.listJobNotesByIds(job.id, [
      selected.id,
      otherJobNote.id,
      "missing-note",
    ]);

    expect(notes).toHaveLength(1);
    expect(notes[0]?.id).toBe(selected.id);
  });

  it("cascades note deletion when the parent job is removed", async () => {
    const job = await jobsRepo.createJob({
      source: "manual",
      title: "Platform Engineer",
      employer: "Beta",
      jobUrl: "https://example.com/job/repo-cascade",
    });

    await jobsRepo.createJobNote({
      jobId: job.id,
      title: "Recruiter contact",
      content: "alex@example.com",
    });

    const notesBeforeDelete = await jobsRepo.listJobNotes(job.id);
    expect(notesBeforeDelete).toHaveLength(1);

    await db.delete(schema.jobs).where(eq(schema.jobs.id, job.id)).run();

    const notesAfterDelete = await jobsRepo.listJobNotes(job.id);
    expect(notesAfterDelete).toHaveLength(0);

    const remainingRows = await db.select().from(schema.jobNotes);
    expect(remainingRows).toHaveLength(0);
  });
});

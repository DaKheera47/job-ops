
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'http';
import { startServer, stopServer } from '../api/routes/test-utils.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import {
  transitionStage,
  updateStageEvent,
  deleteStageEvent,
  getStageEvents
} from './applicationTracking.js';
import { createJob } from '../repositories/jobs.js';

describe.sequential('Application Tracking Service', () => {
  let server: Server;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    // We start the server to get the DB connection initialized in the test env
    ({ server, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it('transitions stage and updates job status', async () => {
    const job = await createJob({
      source: 'manual',
      title: 'Test Developer',
      employer: 'Tech Corp',
      jobUrl: 'https://example.com/job/1',
    });

    // 1. Initial Transition (Applied)
    const event1 = await transitionStage(job.id, 'applied');

    expect(event1.toStage).toBe('applied');

    // Check Job Status
    const jobAfter1 = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)).get();
    expect(jobAfter1?.status).toBe('applied');
    expect(jobAfter1?.appliedAt).toBeTruthy();

    // 2. Next Transition (Recruiter Screen)
    const event2 = await transitionStage(job.id, 'recruiter_screen');
    expect(event2.fromStage).toBe('applied');
    expect(event2.toStage).toBe('recruiter_screen');

    // Check Job Status (still applied for recruiter screen)
    const jobAfter2 = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)).get();
    expect(jobAfter2?.status).toBe('applied');
  });

  it('updates stage event and reflects in job status if latest', async () => {
    const job = await createJob({
      source: 'manual',
      title: 'Frontend Engineer',
      employer: 'Web Co',
      jobUrl: 'https://example.com/job/2',
    });

    const now = Math.floor(Date.now() / 1000);
    const event1 = await transitionStage(job.id, 'applied', now - 100);
    const event2 = await transitionStage(job.id, 'recruiter_screen', now);

    // Update event2 (latest) to 'offer'
    updateStageEvent(event2.id, { toStage: 'offer' });

    // Verify Event Updated
    const events = await getStageEvents(job.id);
    const updatedEvent2 = events.find(e => e.id === event2.id);
    expect(updatedEvent2?.toStage).toBe('offer');

    // Verify Job Status Updated
    const jobUpdated = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)).get();
    expect(jobUpdated?.status).toBe('applied'); // 'offer' maps to 'applied' in status (active)
    expect(jobUpdated?.outcome).toBe('offer_accepted');
  });

  it('deletes stage event and reverts job status', async () => {
    const job = await createJob({
      source: 'manual',
      title: 'Backend Engineer',
      employer: 'Server Co',
      jobUrl: 'https://example.com/job/3',
    });

    const now = Math.floor(Date.now() / 1000);
    await transitionStage(job.id, 'applied', now - 100); // event1

    // Simulate UI sending outcome for rejection
    const event2 = await transitionStage(
      job.id,
      'closed',
      now,
      { reasonCode: 'Skills' },
      'rejected'
    ); // event2

    // Verify job is closed/rejected
    let jobCheck = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)).get();
    expect(jobCheck?.status).toBe('applied');
    expect(jobCheck?.outcome).toBe('rejected');

    // Delete event2
    deleteStageEvent(event2.id);

    // Verify job status reverted to event1 (applied)
    jobCheck = await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)).get();
    expect(jobCheck?.status).toBe('applied');
    expect(jobCheck?.outcome).toBeNull();
  });

  it('handles "no_change" transitions (notes)', async () => {
    const job = await createJob({
      source: 'manual',
      title: 'DevOps',
      employer: 'Cloud Inc',
      jobUrl: 'https://example.com/job/4',
    });

    await transitionStage(job.id, 'applied');
    const noteEvent = await transitionStage(job.id, 'no_change', undefined, { note: 'Just checking in' });

    expect(noteEvent.toStage).toBe('applied');

    const events = await getStageEvents(job.id);
    expect(events).toHaveLength(2);
    expect(events[1].metadata?.note).toBe('Just checking in');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'http';
import { startServer, stopServer } from './test-utils.js';

describe.sequential('Jobs API routes', () => {
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

  it('lists jobs and supports status filtering', async () => {
    const { createJob } = await import('../../repositories/jobs.js');
    const job = await createJob({
      source: 'manual',
      title: 'Test Role',
      employer: 'Acme',
      jobUrl: 'https://example.com/job/1',
      jobDescription: 'Test description',
    });

    const listRes = await fetch(`${baseUrl}/api/jobs`);
    const listBody = await listRes.json();
    expect(listBody.success).toBe(true);
    expect(listBody.data.total).toBe(1);
    expect(listBody.data.jobs[0].id).toBe(job.id);

    const filteredRes = await fetch(`${baseUrl}/api/jobs?status=skipped`);
    const filteredBody = await filteredRes.json();
    expect(filteredBody.data.total).toBe(0);
  });

  it('returns 404 for missing jobs', async () => {
    const res = await fetch(`${baseUrl}/api/jobs/missing-id`);
    expect(res.status).toBe(404);
  });

  it('validates job updates and supports skip/delete flow', async () => {
    const { createJob } = await import('../../repositories/jobs.js');
    const job = await createJob({
      source: 'manual',
      title: 'Test Role',
      employer: 'Acme',
      jobUrl: 'https://example.com/job/2',
      jobDescription: 'Test description',
    });

    const badRes = await fetch(`${baseUrl}/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suitabilityScore: 1000 }),
    });
    expect(badRes.status).toBe(400);

    const skipRes = await fetch(`${baseUrl}/api/jobs/${job.id}/skip`, { method: 'POST' });
    const skipBody = await skipRes.json();
    expect(skipBody.data.status).toBe('skipped');

    const deleteRes = await fetch(`${baseUrl}/api/jobs/status/skipped`, { method: 'DELETE' });
    const deleteBody = await deleteRes.json();
    expect(deleteBody.data.count).toBe(1);
  });

  it('applies a job and syncs to Notion', async () => {
    const { createNotionEntry } = await import('../../services/notion.js');
    vi.mocked(createNotionEntry).mockResolvedValue({ pageId: 'page-123' });

    const { createJob } = await import('../../repositories/jobs.js');
    const job = await createJob({
      source: 'manual',
      title: 'Test Role',
      employer: 'Acme',
      jobUrl: 'https://example.com/job/3',
      jobDescription: 'Test description',
    });

    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/apply`, { method: 'POST' });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('applied');
    expect(body.data.notionPageId).toBe('page-123');
    expect(body.data.appliedAt).toBeTruthy();
    expect(createNotionEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: job.id,
        title: job.title,
        employer: job.employer,
      })
    );
  });
});

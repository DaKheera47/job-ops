import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'http';
import { startServer, stopServer } from './test-utils.js';

describe.sequential('Manual jobs API routes', () => {
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

  it('infers manual jobs and rejects empty payloads', async () => {
    const badRes = await fetch(`${baseUrl}/api/manual-jobs/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(badRes.status).toBe(400);

    const { inferManualJobDetails } = await import('../../services/manualJob.js');
    vi.mocked(inferManualJobDetails).mockResolvedValue({
      job: { title: 'Backend Engineer', employer: 'Acme' },
      warning: null,
    });

    const res = await fetch(`${baseUrl}/api/manual-jobs/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDescription: 'Role description' }),
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.job.title).toBe('Backend Engineer');
  });

  it('imports manual jobs and generates a fallback URL', async () => {
    const { scoreJobSuitability } = await import('../../services/scorer.js');
    vi.mocked(scoreJobSuitability).mockResolvedValue({ score: 88, reason: 'Strong fit' });

    const res = await fetch(`${baseUrl}/api/manual-jobs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job: {
          title: 'Backend Engineer',
          employer: 'Acme',
          jobDescription: 'Great role',
        },
      }),
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.source).toBe('manual');
    expect(body.data.jobUrl).toMatch(/^manual:\/\//);
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
});

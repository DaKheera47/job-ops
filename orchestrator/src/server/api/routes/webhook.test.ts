import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import { startServer, stopServer } from './test-utils.js';

describe.sequential('Webhook API routes', () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: { WEBHOOK_SECRET: 'secret' },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it('rejects invalid webhook credentials and accepts valid ones', async () => {
    const badRes = await fetch(`${baseUrl}/api/webhook/trigger`, {
      method: 'POST',
    });
    expect(badRes.status).toBe(401);

    const goodRes = await fetch(`${baseUrl}/api/webhook/trigger`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
    });
    const goodBody = await goodRes.json();
    expect(goodBody.success).toBe(true);
    expect(goodBody.data.message).toBe('Pipeline triggered');
  });
});

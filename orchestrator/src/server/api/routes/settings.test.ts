import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import { startServer, stopServer } from './test-utils.js';

describe.sequential('Settings API routes', () => {
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

  it('returns settings with defaults', async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.defaultModel).toBe('test-model');
    expect(Array.isArray(body.data.searchTerms)).toBe(true);
  });

  it('rejects invalid settings updates and persists overrides', async () => {
    const badPatch = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobspyResultsWanted: 9999 }),
    });
    expect(badPatch.status).toBe(400);

    const patchRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchTerms: ['engineer'] }),
    });
    const patchBody = await patchRes.json();
    expect(patchBody.success).toBe(true);
    expect(patchBody.data.searchTerms).toEqual(['engineer']);
    expect(patchBody.data.overrideSearchTerms).toEqual(['engineer']);
  });
});

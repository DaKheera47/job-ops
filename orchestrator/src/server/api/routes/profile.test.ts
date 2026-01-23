import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'http';
import { startServer, stopServer } from './test-utils.js';

// Mock the rxresume-v4 service
vi.mock('../../services/rxresume-v4.js', () => ({
  getResume: vi.fn(),
  listResumes: vi.fn(),
  RxResumeCredentialsError: class RxResumeCredentialsError extends Error {
    constructor() {
      super('RxResume credentials not configured.');
      this.name = 'RxResumeCredentialsError';
    }
  },
}));

// Mock the profile service
vi.mock('../../services/profile.js', () => ({
  getProfile: vi.fn(),
  clearProfileCache: vi.fn(),
}));

// Mock the settings repository
vi.mock('../../repositories/settings.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getSetting: vi.fn(),
  };
});

import { getResume, RxResumeCredentialsError } from '../../services/rxresume-v4.js';
import { getProfile } from '../../services/profile.js';
import { getSetting } from '../../repositories/settings.js';

describe.sequential('Profile API routes', () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  describe('GET /api/profile/projects', () => {
    it('returns projects when profile is configured', async () => {
      const mockProfile = {
        sections: {
          projects: {
            items: [
              { id: 'proj1', name: 'Project 1', description: 'Desc 1', date: '2024', visible: true },
              { id: 'proj2', name: 'Project 2', description: 'Desc 2', date: '2023', visible: false },
            ],
          },
        },
      };
      vi.mocked(getProfile).mockResolvedValue(mockProfile);

      const res = await fetch(`${baseUrl}/api/profile/projects`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
    });

    it('returns error when profile is not configured', async () => {
      vi.mocked(getProfile).mockRejectedValue(new Error('Base resume not configured.'));

      const res = await fetch(`${baseUrl}/api/profile/projects`);
      const body = await res.json();

      expect(res.ok).toBe(false);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Base resume not configured');
    });
  });

  describe('GET /api/profile', () => {
    it('returns full profile when configured', async () => {
      const mockProfile = {
        basics: { name: 'Test User', headline: 'Developer' },
        sections: { summary: { content: 'A summary' } },
      };
      vi.mocked(getProfile).mockResolvedValue(mockProfile);

      const res = await fetch(`${baseUrl}/api/profile`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockProfile);
    });

    it('returns error when profile is not configured', async () => {
      vi.mocked(getProfile).mockRejectedValue(new Error('Base resume not configured.'));

      const res = await fetch(`${baseUrl}/api/profile`);
      const body = await res.json();

      expect(res.ok).toBe(false);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Base resume not configured');
    });
  });

  describe('GET /api/profile/status', () => {
    it('returns exists: false when rxresumeBaseResumeId is not configured', async () => {
      vi.mocked(getSetting).mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toContain('No base resume selected');
    });

    it('returns exists: true when resume is accessible', async () => {
      vi.mocked(getSetting).mockResolvedValue('test-resume-id');
      vi.mocked(getResume).mockResolvedValue({
        id: 'test-resume-id',
        data: { basics: { name: 'Test' } },
      } as any);

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);
      expect(body.data.exists).toBe(true);
      expect(body.data.error).toBeNull();
    });

    it('returns exists: false when RxResume credentials are missing', async () => {
      vi.mocked(getSetting).mockResolvedValue('test-resume-id');
      vi.mocked(getResume).mockRejectedValue(new RxResumeCredentialsError());

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toContain('credentials not configured');
    });

    it('returns exists: false when resume data is empty', async () => {
      vi.mocked(getSetting).mockResolvedValue('test-resume-id');
      vi.mocked(getResume).mockResolvedValue({
        id: 'test-resume-id',
        data: null,
      } as any);

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();


      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toContain('empty or invalid');
    });
  });

  // Note: POST /api/profile/refresh tests skipped because basic auth blocks POST in test environment
  // The endpoint is tested indirectly through the profile service tests
});

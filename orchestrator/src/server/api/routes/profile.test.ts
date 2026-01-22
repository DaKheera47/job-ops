import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import { writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { startServer, stopServer } from './test-utils.js';

describe.sequential('Profile API routes', () => {
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

  it('returns base resume projects', async () => {
    // Create valid resume file first
    const resumePath = join(tempDir, 'resume.json');
    await writeFile(resumePath, JSON.stringify(createMinimalValidResume()));

    const res = await fetch(`${baseUrl}/api/profile/projects`);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns full base resume profile', async () => {
    // Create valid resume file first
    const resumePath = join(tempDir, 'resume.json');
    await writeFile(resumePath, JSON.stringify(createMinimalValidResume()));

    const res = await fetch(`${baseUrl}/api/profile`);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(typeof body.data).toBe('object');
  });


  describe('GET /api/profile/status', () => {
    it('returns exists: false when resume file does not exist', async () => {
      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toBeTruthy();
    });

    it('returns exists: false when resume file is empty', async () => {
      const resumePath = join(tempDir, 'resume.json');
      await writeFile(resumePath, '');

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data.exists).toBe(false);
    });

    it('returns exists: true when valid resume file exists', async () => {
      const resumePath = join(tempDir, 'resume.json');
      await writeFile(resumePath, JSON.stringify(createMinimalValidResume()));

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);
      expect(body.data.exists).toBe(true);
      expect(body.data.error).toBeNull();
    });
  });

  describe('POST /api/profile/upload', () => {
    it('rejects request without profile payload', async () => {
      const res = await fetch(`${baseUrl}/api/profile/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid profile payload');
    });

    it('rejects array as profile payload', async () => {
      const res = await fetch(`${baseUrl}/api/profile/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: [] }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid profile payload');
    });

    it('rejects primitive as profile payload', async () => {
      const res = await fetch(`${baseUrl}/api/profile/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: 'not an object' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid profile payload');
    });

    it('rejects invalid resume with detailed field path in error', async () => {
      const res = await fetch(`${baseUrl}/api/profile/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { foo: 'bar' } }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid resume JSON');
      // Should include field path in error message
      expect(body.error).toMatch(/Field "[^"]+"/);
    });

    it('accepts valid resume and creates file', async () => {
      const validResume = createMinimalValidResume();
      const res = await fetch(`${baseUrl}/api/profile/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: validResume }),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);
      expect(body.data.exists).toBe(true);
      expect(body.data.error).toBeNull();

      // Verify file was created
      const resumePath = join(tempDir, 'resume.json');
      const fileInfo = await stat(resumePath);
      expect(fileInfo.isFile()).toBe(true);
      expect(fileInfo.size).toBeGreaterThan(0);
    });

    it('overwrites existing resume file', async () => {
      const resumePath = join(tempDir, 'resume.json');
      const oldResume = createMinimalValidResume();
      oldResume.basics.name = 'Old Name';
      await writeFile(resumePath, JSON.stringify(oldResume));

      const newResume = createMinimalValidResume();
      newResume.basics.name = 'New Name';
      const res = await fetch(`${baseUrl}/api/profile/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: newResume }),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.success).toBe(true);

      // Verify profile was updated
      const profileRes = await fetch(`${baseUrl}/api/profile`);
      const profileBody = await profileRes.json();
      expect(profileBody.data.basics.name).toBe('New Name');
    });
  });
});

/**
 * Creates a minimal valid RxResume v4 schema compliant JSON
 */
function createMinimalValidResume() {
  return {
    basics: {
      name: 'Test User',
      headline: 'Software Developer',
      email: 'test@example.com',
      phone: '',
      location: '',
      url: { label: '', href: '' },
      customFields: [],
      picture: {
        url: '',
        size: 64,
        aspectRatio: 1,
        borderRadius: 0,
        effects: { hidden: false, border: false, grayscale: false },
      },
    },
    sections: {
      summary: { id: 'summary', name: 'Summary', columns: 1, separateLinks: true, visible: true, content: '' },
      skills: { id: 'skills', name: 'Skills', columns: 1, separateLinks: true, visible: true, items: [] },
      awards: { id: 'awards', name: 'Awards', columns: 1, separateLinks: true, visible: true, items: [] },
      certifications: { id: 'certifications', name: 'Certifications', columns: 1, separateLinks: true, visible: true, items: [] },
      education: { id: 'education', name: 'Education', columns: 1, separateLinks: true, visible: true, items: [] },
      experience: { id: 'experience', name: 'Experience', columns: 1, separateLinks: true, visible: true, items: [] },
      volunteer: { id: 'volunteer', name: 'Volunteer', columns: 1, separateLinks: true, visible: true, items: [] },
      interests: { id: 'interests', name: 'Interests', columns: 1, separateLinks: true, visible: true, items: [] },
      languages: { id: 'languages', name: 'Languages', columns: 1, separateLinks: true, visible: true, items: [] },
      profiles: { id: 'profiles', name: 'Profiles', columns: 1, separateLinks: true, visible: true, items: [] },
      projects: { id: 'projects', name: 'Projects', columns: 1, separateLinks: true, visible: true, items: [] },
      publications: { id: 'publications', name: 'Publications', columns: 1, separateLinks: true, visible: true, items: [] },
      references: { id: 'references', name: 'References', columns: 1, separateLinks: true, visible: true, items: [] },
      custom: {},
    },
    metadata: {
      template: 'rhyhorn',
      layout: [[['summary'], ['skills']]],
      css: { value: '', visible: false },
      page: { margin: 18, format: 'a4', options: { breakLine: true, pageNumbers: true } },
      theme: { background: '#ffffff', text: '#000000', primary: '#dc2626' },
      typography: {
        font: { family: 'IBM Plex Serif', subset: 'latin', variants: ['regular'], size: 14 },
        lineHeight: 1.5,
        hideIcons: false,
        underlineLinks: true,
      },
      notes: '',
    },
  };
}

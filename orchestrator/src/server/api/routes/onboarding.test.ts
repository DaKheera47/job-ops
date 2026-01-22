import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { startServer, stopServer } from './test-utils.js';

describe.sequential('Onboarding API routes', () => {
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

    describe('POST /api/onboarding/validate/openrouter', () => {
        it('returns invalid when no API key is provided and none in env', async () => {
            const res = await fetch(`${baseUrl}/api/onboarding/validate/openrouter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.success).toBe(true);
            expect(body.data.valid).toBe(false);
            expect(body.data.message).toContain('missing');
        });

        it('returns invalid when API key is empty string', async () => {
            const res = await fetch(`${baseUrl}/api/onboarding/validate/openrouter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: '   ' }),
            });
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.data.valid).toBe(false);
            expect(body.data.message).toContain('missing');
        });

        it('validates an invalid API key against OpenRouter', async () => {
            const res = await fetch(`${baseUrl}/api/onboarding/validate/openrouter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: 'sk-or-invalid-key-12345' }),
            });
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.success).toBe(true);
            // Should be invalid because the key is fake
            expect(body.data.valid).toBe(false);
        });
    });

    describe('POST /api/onboarding/validate/rxresume', () => {
        it('returns invalid when no credentials are provided and none in env', async () => {
            const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.success).toBe(true);
            expect(body.data.valid).toBe(false);
            expect(body.data.message).toContain('missing');
        });

        it('returns invalid when only email is provided', async () => {
            const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'test@example.com' }),
            });
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.data.valid).toBe(false);
            expect(body.data.message).toContain('missing');
        });

        it('returns invalid when only password is provided', async () => {
            const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'testpass' }),
            });
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.data.valid).toBe(false);
            expect(body.data.message).toContain('missing');
        });

        it('validates invalid credentials against RxResume', async () => {
            const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'nonexistent@test.com',
                    password: 'wrongpassword123',
                }),
            });
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.success).toBe(true);
            // Should be invalid because credentials are fake
            expect(body.data.valid).toBe(false);
        });

        it('handles whitespace-only credentials', async () => {
            const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: '   ', password: '   ' }),
            });
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.data.valid).toBe(false);
            expect(body.data.message).toContain('missing');
        });
    });

    describe('GET /api/onboarding/validate/resume', () => {
        it('returns invalid when no resume file exists', async () => {
            const res = await fetch(`${baseUrl}/api/onboarding/validate/resume`);
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.success).toBe(true);
            expect(body.data.valid).toBe(false);
            expect(body.data.message).toBeTruthy();
        });

        it('returns invalid when resume file is empty', async () => {
            // Create an empty resume file
            const resumePath = join(tempDir, 'resume.json');
            await writeFile(resumePath, '');

            const res = await fetch(`${baseUrl}/api/onboarding/validate/resume`);
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.data.valid).toBe(false);
        });

        it('returns invalid when resume file is invalid JSON', async () => {
            const resumePath = join(tempDir, 'resume.json');
            await writeFile(resumePath, 'not valid json {{{');

            const res = await fetch(`${baseUrl}/api/onboarding/validate/resume`);
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.data.valid).toBe(false);
            expect(body.data.message).toBeTruthy();
        });

        it('returns invalid with field path when resume does not match schema', async () => {
            const resumePath = join(tempDir, 'resume.json');
            // Valid JSON but missing required fields
            await writeFile(resumePath, JSON.stringify({ foo: 'bar' }));

            const res = await fetch(`${baseUrl}/api/onboarding/validate/resume`);
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.data.valid).toBe(false);
            // Should include field path in error message
            expect(body.data.message).toBeTruthy();
        });

        it('returns valid when resume file is valid and matches schema', async () => {
            const resumePath = join(tempDir, 'resume.json');
            const validResume = createMinimalValidResume();
            await writeFile(resumePath, JSON.stringify(validResume));

            const res = await fetch(`${baseUrl}/api/onboarding/validate/resume`);
            const body = await res.json();

            expect(res.ok).toBe(true);
            expect(body.success).toBe(true);
            expect(body.data.valid).toBe(true);
            expect(body.data.message).toBeNull();
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

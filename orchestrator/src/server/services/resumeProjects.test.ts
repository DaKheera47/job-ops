
import { describe, it, expect } from 'vitest';
import * as rp from './resumeProjects.js';
import type { ResumeProjectCatalogItem } from '../../shared/types.js';

describe('Resume Projects Logic', () => {

    describe('stripHtml', () => {
        it('should remove html tags and normalize whitespace', () => {
            const input = '<p>This is <b>bold</b> and <br>broken.</p>';
            const output = rp.stripHtml(input);
            expect(output).toBe('This is bold and broken.');
        });

        it('should handle empty input', () => {
            expect(rp.stripHtml('')).toBe('');
        });
    });

    describe('extractProjectsFromProfile', () => {
        it('should return empty lists if profile is invalid', () => {
            const result = rp.extractProjectsFromProfile({});
            expect(result.catalog).toEqual([]);
        });

        it('should extract valid projects and map visible flag', () => {
            const profile = {
                sections: {
                    projects: {
                        items: [
                            { id: 'p1', name: 'Proj 1', summary: '<p>Desc 1</p>', visible: true },
                            { id: 'p2', name: 'Proj 2', summary: 'Desc 2', visible: false },
                            { name: 'No ID' } // Should be skipped
                        ]
                    }
                }
            };

            const { catalog, selectionItems } = rp.extractProjectsFromProfile(profile);

            expect(catalog).toHaveLength(2);
            expect(catalog[0].id).toBe('p1');
            expect(catalog[0].isVisibleInBase).toBe(true);
            expect(catalog[1].id).toBe('p2');
            expect(catalog[1].isVisibleInBase).toBe(false);

            expect(selectionItems).toHaveLength(2);
            expect(selectionItems[0].summaryText).toBe('Desc 1');
        });
    });

    describe('normalizeResumeProjectsSettings', () => {
        const allowedIds = new Set(['a', 'b', 'c', 'd']);

        it('should remove duplicates and enforce allowed IDs', () => {
            const input = {
                maxProjects: 10,
                lockedProjectIds: ['a', 'a', 'z'], // z invalid
                aiSelectableProjectIds: ['b', 'b', 'b', 'a'] // b valid, a is already locked
            };

            const result = rp.normalizeResumeProjectsSettings(input, allowedIds);

            expect(result.lockedProjectIds).toEqual(['a']);
            expect(result.aiSelectableProjectIds).toEqual(['b']);
        });

        it('should ensure maxProjects is at least len(locked)', () => {
            const input = {
                maxProjects: 1, // Too small
                lockedProjectIds: ['a', 'b'],
                aiSelectableProjectIds: []
            };

            const result = rp.normalizeResumeProjectsSettings(input, allowedIds);
            expect(result.maxProjects).toBe(2);
        });

        it('should clamp maxProjects to catalog size', () => {
            const smallAllowed = new Set(['a']);
            const input = {
                maxProjects: 5,
                lockedProjectIds: [],
                aiSelectableProjectIds: ['a']
            };

            const result = rp.normalizeResumeProjectsSettings(input, smallAllowed);
            expect(result.maxProjects).toBe(1);
        });
    });

    describe('resolveResumeProjectsSettings', () => {
        const mockCatalog: ResumeProjectCatalogItem[] = [
            { id: 'p1', name: 'P1', description: '', date: '', isVisibleInBase: true },
            { id: 'p2', name: 'P2', description: '', date: '', isVisibleInBase: false },
            { id: 'p3', name: 'P3', description: '', date: '', isVisibleInBase: false },
        ];

        it('should return defaults when no override is provided', () => {
            const result = rp.resolveResumeProjectsSettings({
                catalog: mockCatalog,
                overrideRaw: null
            });

            // p1 is visible in base, so it should be locked by default
            expect(result.resumeProjects.lockedProjectIds).toEqual(['p1']);
            expect(result.resumeProjects.aiSelectableProjectIds).toEqual(['p2', 'p3']);
            expect(result.resumeProjects.maxProjects).toBe(3);
        });

        it('should apply valid overrides', () => {
            const validOverride = JSON.stringify({
                maxProjects: 2,
                lockedProjectIds: ['p2'],
                aiSelectableProjectIds: ['p1', 'p3']
            });

            const result = rp.resolveResumeProjectsSettings({
                catalog: mockCatalog,
                overrideRaw: validOverride
            });

            expect(result.resumeProjects.lockedProjectIds).toEqual(['p2']);
            expect(result.resumeProjects.aiSelectableProjectIds).toContain('p1');
            expect(result.resumeProjects.aiSelectableProjectIds).toContain('p3');
            expect(result.resumeProjects.maxProjects).toBe(2);
        });

        it('should handle invalid overrides by falling back to defaults', () => {
            const result = rp.resolveResumeProjectsSettings({
                catalog: mockCatalog,
                overrideRaw: '{"broken json'
            });

            expect(result.overrideResumeProjects).toBeNull();
            expect(result.resumeProjects.lockedProjectIds).toEqual(['p1']);
        });
    });
});

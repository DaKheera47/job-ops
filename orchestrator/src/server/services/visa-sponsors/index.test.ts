import { describe, it, expect } from 'vitest';
import { calculateSponsorMatchSummary } from './index.js';
import type { VisaSponsorSearchResult } from '../../../shared/types.js';

describe('calculateSponsorMatchSummary', () => {
    it('should return default values for empty results', () => {
        const results: VisaSponsorSearchResult[] = [];
        const summary = calculateSponsorMatchSummary(results);

        expect(summary.sponsorMatchScore).toBe(0);
        expect(summary.sponsorMatchNames).toBeNull();
    });

    it('should report the top match when it is not a perfect match', () => {
        const results: VisaSponsorSearchResult[] = [
            {
                score: 85,
                sponsor: { organisationName: 'Tech Corp' } as any,
                matchedName: 'tech corp'
            },
            {
                score: 60,
                sponsor: { organisationName: 'Other Ltd' } as any,
                matchedName: 'other'
            }
        ];

        const summary = calculateSponsorMatchSummary(results);

        expect(summary.sponsorMatchScore).toBe(85);
        expect(summary.sponsorMatchNames).toBe(JSON.stringify(['Tech Corp']));
    });

    it('should report a single perfect match', () => {
        const results: VisaSponsorSearchResult[] = [
            {
                score: 100,
                sponsor: { organisationName: 'Exact Match Ltd' } as any,
                matchedName: 'exact match'
            },
            {
                score: 90,
                sponsor: { organisationName: 'Close Match' } as any,
                matchedName: 'close'
            }
        ];

        const summary = calculateSponsorMatchSummary(results);

        expect(summary.sponsorMatchScore).toBe(100);
        expect(summary.sponsorMatchNames).toBe(JSON.stringify(['Exact Match Ltd']));
    });

    it('should report exactly two 100% matches when two or more exist', () => {
        const results: VisaSponsorSearchResult[] = [
            {
                score: 100,
                sponsor: { organisationName: 'First PerfectMatch' } as any,
                matchedName: 'match'
            },
            {
                score: 100,
                sponsor: { organisationName: 'Second PerfectMatch' } as any,
                matchedName: 'match'
            },
            {
                score: 100,
                sponsor: { organisationName: 'Third PerfectMatch' } as any,
                matchedName: 'match'
            },
            {
                score: 50,
                sponsor: { organisationName: 'Common Co' } as any,
                matchedName: 'common'
            }
        ];

        const summary = calculateSponsorMatchSummary(results);

        expect(summary.sponsorMatchScore).toBe(100);
        const names = JSON.parse(summary.sponsorMatchNames!);
        expect(names).toHaveLength(2);
        expect(names).toContain('First PerfectMatch');
        expect(names).toContain('Second PerfectMatch');
        expect(names).not.toContain('Third PerfectMatch');
    });

    it('should only report the single top result if no 100% matches exist', () => {
        const results: VisaSponsorSearchResult[] = [
            {
                score: 99,
                sponsor: { organisationName: 'Almost Perfect' } as any,
                matchedName: 'almost'
            },
            {
                score: 98,
                sponsor: { organisationName: 'Second Best' } as any,
                matchedName: 'best'
            }
        ];

        const summary = calculateSponsorMatchSummary(results);

        expect(summary.sponsorMatchScore).toBe(99);
        expect(summary.sponsorMatchNames).toBe(JSON.stringify(['Almost Perfect']));
    });
});

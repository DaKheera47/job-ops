/**
 * Tests for sponsor match calculation logic in the pipeline orchestrator.
 * 
 * These tests verify that during job scoring, the sponsor matching functionality
 * correctly calculates and stores sponsor match scores and names.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Job } from '../../shared/types.js';

// Mock the visa-sponsors module
vi.mock('../services/visa-sponsors/index.js', () => ({
    searchSponsors: vi.fn(),
    calculateSponsorMatchSummary: vi.fn(),
}));

// Mock the scorer module
vi.mock('../services/scorer.js', () => ({
    scoreJobSuitability: vi.fn(),
}));

// Mock the jobs repository
vi.mock('../repositories/jobs.js', () => ({
    updateJob: vi.fn(),
    getUnscoredDiscoveredJobs: vi.fn(),
    getJobById: vi.fn(),
    bulkCreateJobs: vi.fn(),
    getAllJobUrls: vi.fn(),
}));

// Mock other dependencies to prevent side effects
vi.mock('../repositories/pipeline.js', () => ({
    createPipelineRun: vi.fn(() => ({ id: 'test-run-id' })),
    updatePipelineRun: vi.fn(),
}));

vi.mock('../repositories/settings.js', () => ({
    getSetting: vi.fn().mockResolvedValue(null),
    getAllSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('../services/crawler.js', () => ({
    runCrawler: vi.fn(() => ({ success: true, jobs: [] })),
}));

vi.mock('../services/jobspy.js', () => ({
    runJobSpy: vi.fn(() => ({ success: true, jobs: [] })),
}));

vi.mock('../services/ukvisajobs.js', () => ({
    runUkVisaJobs: vi.fn(() => ({ success: true, jobs: [] })),
}));

const now = new Date().toISOString();

// Mock job template
const createMockJob = (overrides: Partial<Job> = {}): Job => ({
    id: 'test-job-1',
    source: 'gradcracker',
    sourceJobId: null,
    jobUrlDirect: null,
    datePosted: null,
    title: 'Software Engineer',
    employer: 'Acme Corporation Ltd',
    employerUrl: null,
    jobUrl: 'http://test.com/job',
    applicationLink: null,
    disciplines: null,
    deadline: null,
    salary: null,
    location: 'London',
    degreeRequired: null,
    starting: null,
    jobDescription: 'Looking for a TypeScript developer.',
    status: 'discovered',
    suitabilityScore: null,
    suitabilityReason: null,
    tailoredSummary: null,
    tailoredHeadline: null,
    tailoredSkills: null,
    selectedProjectIds: null,
    pdfPath: null,
    notionPageId: null,
    sponsorMatchScore: null,
    sponsorMatchNames: null,
    jobType: null,
    salarySource: null,
    salaryInterval: null,
    salaryMinAmount: null,
    salaryMaxAmount: null,
    salaryCurrency: null,
    isRemote: null,
    jobLevel: null,
    jobFunction: null,
    listingType: null,
    emails: null,
    companyIndustry: null,
    companyLogo: null,
    companyUrlDirect: null,
    companyAddresses: null,
    companyNumEmployees: null,
    companyRevenue: null,
    companyDescription: null,
    skills: null,
    experienceRange: null,
    companyRating: null,
    companyReviewsCount: null,
    vacancyCount: null,
    workFromHomeType: null,
    discoveredAt: now,
    processedAt: null,
    appliedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
});

describe('Sponsor Match Calculation', () => {
    let searchSponsors: ReturnType<typeof vi.fn>;
    let calculateSponsorMatchSummary: ReturnType<typeof vi.fn>;
    let scoreJobSuitability: ReturnType<typeof vi.fn>;
    let updateJob: ReturnType<typeof vi.fn>;
    let getUnscoredDiscoveredJobs: ReturnType<typeof vi.fn>;
    let bulkCreateJobs: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Get mocked functions
        const visaSponsors = await import('../services/visa-sponsors/index.js');
        const scorer = await import('../services/scorer.js');
        const jobsRepo = await import('../repositories/jobs.js');

        searchSponsors = visaSponsors.searchSponsors as ReturnType<typeof vi.fn>;
        calculateSponsorMatchSummary = visaSponsors.calculateSponsorMatchSummary as ReturnType<typeof vi.fn>;
        scoreJobSuitability = scorer.scoreJobSuitability as ReturnType<typeof vi.fn>;
        updateJob = jobsRepo.updateJob as ReturnType<typeof vi.fn>;
        getUnscoredDiscoveredJobs = jobsRepo.getUnscoredDiscoveredJobs as ReturnType<typeof vi.fn>;
        bulkCreateJobs = jobsRepo.bulkCreateJobs as ReturnType<typeof vi.fn>;

        // Default mock implementations
        scoreJobSuitability.mockResolvedValue({ score: 75, reason: 'Good match' });
        bulkCreateJobs.mockResolvedValue({ created: 0, skipped: 0 });
        updateJob.mockResolvedValue(undefined);

        calculateSponsorMatchSummary.mockImplementation((results: any[]) => {
            if (results.length === 0) return { sponsorMatchScore: 0, sponsorMatchNames: null };
            const topScore = results[0].score;
            const perfectMatches = results.filter((r: any) => r.score === 100);
            const matchesToReport = perfectMatches.length >= 2 ? perfectMatches.slice(0, 2) : [results[0]];
            return {
                sponsorMatchScore: topScore,
                sponsorMatchNames: JSON.stringify(matchesToReport.map((r: any) => r.sponsor.organisationName)),
            };
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('searchSponsors integration', () => {
        it('should calculate sponsor match score when employer matches a sponsor', async () => {
            const mockJob = createMockJob({ employer: 'Acme Corporation Ltd' });
            getUnscoredDiscoveredJobs.mockResolvedValue([mockJob]);

            // Mock sponsor search returning a match
            searchSponsors.mockReturnValue([
                {
                    sponsor: { organisationName: 'ACME CORPORATION LIMITED' },
                    score: 85,
                    matchedName: 'acme corporation',
                },
            ]);

            // Import and run pipeline
            const { runPipeline } = await import('./orchestrator.js');
            await runPipeline({ sources: [], enableCrawling: false });

            // Verify searchSponsors was called with correct parameters
            expect(searchSponsors).toHaveBeenCalledWith('Acme Corporation Ltd', {
                limit: 10,
                minScore: 50,
            });

            // Verify updateJob was called with sponsor match data
            expect(updateJob).toHaveBeenCalledWith(
                'test-job-1',
                expect.objectContaining({
                    suitabilityScore: 75,
                    suitabilityReason: 'Good match',
                    sponsorMatchScore: 85,
                    sponsorMatchNames: JSON.stringify(['ACME CORPORATION LIMITED']),
                })
            );
        });

        it('should handle 100% perfect matches correctly', async () => {
            const mockJob = createMockJob({ employer: 'Microsoft UK' });
            getUnscoredDiscoveredJobs.mockResolvedValue([mockJob]);

            // Mock sponsor search returning perfect matches
            searchSponsors.mockReturnValue([
                {
                    sponsor: { organisationName: 'MICROSOFT UK LIMITED' },
                    score: 100,
                    matchedName: 'microsoft uk',
                },
                {
                    sponsor: { organisationName: 'MICROSOFT UK LTD' },
                    score: 100,
                    matchedName: 'microsoft uk',
                },
                {
                    sponsor: { organisationName: 'MICROSOFT LIMITED' },
                    score: 80,
                    matchedName: 'microsoft',
                },
            ]);

            const { runPipeline } = await import('./orchestrator.js');
            await runPipeline({ sources: [], enableCrawling: false });

            // Should include up to 2 perfect matches
            expect(updateJob).toHaveBeenCalledWith(
                'test-job-1',
                expect.objectContaining({
                    sponsorMatchScore: 100,
                    sponsorMatchNames: JSON.stringify([
                        'MICROSOFT UK LIMITED',
                        'MICROSOFT UK LTD',
                    ]),
                })
            );
        });

        it('should report single top match when no perfect matches exist', async () => {
            const mockJob = createMockJob({ employer: 'Tech Corp' });
            getUnscoredDiscoveredJobs.mockResolvedValue([mockJob]);

            // Mock sponsor search returning partial matches only
            searchSponsors.mockReturnValue([
                {
                    sponsor: { organisationName: 'TECH CORPORATION' },
                    score: 75,
                    matchedName: 'tech corporation',
                },
                {
                    sponsor: { organisationName: 'TECHNO CORP' },
                    score: 60,
                    matchedName: 'techno corp',
                },
            ]);

            const { runPipeline } = await import('./orchestrator.js');
            await runPipeline({ sources: [], enableCrawling: false });

            // Should only include the top match since none are 100%
            expect(updateJob).toHaveBeenCalledWith(
                'test-job-1',
                expect.objectContaining({
                    sponsorMatchScore: 75,
                    sponsorMatchNames: JSON.stringify(['TECH CORPORATION']),
                })
            );
        });

        it('should not set sponsor match when no matches found', async () => {
            const mockJob = createMockJob({ employer: 'Unknown Company XYZ' });
            getUnscoredDiscoveredJobs.mockResolvedValue([mockJob]);

            // Mock sponsor search returning no matches
            searchSponsors.mockReturnValue([]);

            const { runPipeline } = await import('./orchestrator.js');
            await runPipeline({ sources: [], enableCrawling: false });

            // sponsorMatchScore should be 0 (not set) and sponsorMatchNames undefined
            expect(updateJob).toHaveBeenCalledWith(
                'test-job-1',
                expect.objectContaining({
                    suitabilityScore: 75,
                    suitabilityReason: 'Good match',
                })
            );

            // Verify that sponsorMatchScore is 0 and sponsorMatchNames is not included
            // when there are no matches
            const updateCall = updateJob.mock.calls[0][1];
            expect(updateCall.sponsorMatchScore).toBe(0);
            expect(updateCall.sponsorMatchNames).toBeUndefined();
        });

        it('should skip sponsor matching when job has no employer', async () => {
            const mockJob = createMockJob({ employer: null as unknown as string });
            getUnscoredDiscoveredJobs.mockResolvedValue([mockJob]);

            const { runPipeline } = await import('./orchestrator.js');
            await runPipeline({ sources: [], enableCrawling: false });

            // searchSponsors should not be called
            expect(searchSponsors).not.toHaveBeenCalled();

            // updateJob should still be called but without sponsor data
            expect(updateJob).toHaveBeenCalledWith(
                'test-job-1',
                expect.objectContaining({
                    suitabilityScore: 75,
                    suitabilityReason: 'Good match',
                })
            );
        });

        it('should skip sponsor matching when job has empty employer string', async () => {
            const mockJob = createMockJob({ employer: '' });
            getUnscoredDiscoveredJobs.mockResolvedValue([mockJob]);

            const { runPipeline } = await import('./orchestrator.js');
            await runPipeline({ sources: [], enableCrawling: false });

            // searchSponsors should not be called for empty string
            expect(searchSponsors).not.toHaveBeenCalled();
        });
    });

    describe('sponsor match edge cases', () => {
        it('should use correct limit and minScore options', async () => {
            const mockJob = createMockJob({ employer: 'Test Company' });
            getUnscoredDiscoveredJobs.mockResolvedValue([mockJob]);
            searchSponsors.mockReturnValue([]);

            const { runPipeline } = await import('./orchestrator.js');
            await runPipeline({ sources: [], enableCrawling: false });

            expect(searchSponsors).toHaveBeenCalledWith('Test Company', {
                limit: 10,
                minScore: 50,
            });
        });

        it('should handle single 100% match correctly', async () => {
            const mockJob = createMockJob({ employer: 'Google UK' });
            getUnscoredDiscoveredJobs.mockResolvedValue([mockJob]);

            searchSponsors.mockReturnValue([
                {
                    sponsor: { organisationName: 'GOOGLE UK LIMITED' },
                    score: 100,
                    matchedName: 'google uk',
                },
            ]);

            const { runPipeline } = await import('./orchestrator.js');
            await runPipeline({ sources: [], enableCrawling: false });

            // Single perfect match should be reported
            expect(updateJob).toHaveBeenCalledWith(
                'test-job-1',
                expect.objectContaining({
                    sponsorMatchScore: 100,
                    sponsorMatchNames: JSON.stringify(['GOOGLE UK LIMITED']),
                })
            );
        });

        it('should process multiple jobs with different sponsor matches', async () => {
            const mockJob1 = createMockJob({
                id: 'job-1',
                employer: 'Amazon UK',
            });
            const mockJob2 = createMockJob({
                id: 'job-2',
                employer: 'Meta Platforms',
            });

            getUnscoredDiscoveredJobs.mockResolvedValue([mockJob1, mockJob2]);

            // Different results for each employer
            searchSponsors
                .mockReturnValueOnce([
                    {
                        sponsor: { organisationName: 'AMAZON UK SERVICES LTD' },
                        score: 90,
                        matchedName: 'amazon uk',
                    },
                ])
                .mockReturnValueOnce([
                    {
                        sponsor: { organisationName: 'META PLATFORMS IRELAND LIMITED' },
                        score: 80,
                        matchedName: 'meta platforms',
                    },
                ]);

            const { runPipeline } = await import('./orchestrator.js');
            await runPipeline({ sources: [], enableCrawling: false });

            // Verify both jobs were processed with different sponsor data
            expect(updateJob).toHaveBeenCalledTimes(2);

            expect(updateJob).toHaveBeenCalledWith(
                'job-1',
                expect.objectContaining({
                    sponsorMatchScore: 90,
                    sponsorMatchNames: JSON.stringify(['AMAZON UK SERVICES LTD']),
                })
            );

            expect(updateJob).toHaveBeenCalledWith(
                'job-2',
                expect.objectContaining({
                    sponsorMatchScore: 80,
                    sponsorMatchNames: JSON.stringify(['META PLATFORMS IRELAND LIMITED']),
                })
            );
        });
    });
});

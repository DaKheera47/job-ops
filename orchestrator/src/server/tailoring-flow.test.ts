
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as jobsRepo from './repositories/jobs.js';
import * as pdfService from './services/pdf.js';
import { generateFinalPdf } from './pipeline/orchestrator.js';

// Mock dependencies
vi.mock('./repositories/jobs.js');
vi.mock('./services/pdf.js');

describe('Tailoring Flow', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should use manual overrides (tailoring) when generating PDF', async () => {
        // 1. Setup: A job exists with manual tailoring applied (e.g. via the UI)
        // This simulates a job where the user has edited the summary and projects
        const tailoredJob = {
            id: 'job-tailored-123',
            jobDescription: 'Senior TypeScript Developer',
            status: 'discovered',
            // Manual overrides:
            tailoredSummary: 'This is a manually edited summary specifically for this job.',
            tailoredHeadline: 'Manually Edited Headline',
            tailoredSkills: JSON.stringify(['React', 'TypeScript', 'Vitest']),
            selectedProjectIds: 'project-a,project-c', // User selected specific projects
        };

        // Mock getting the job
        vi.mocked(jobsRepo.getJobById).mockResolvedValue(tailoredJob as any);

        // Mock successful PDF generation
        vi.mocked(pdfService.generatePdf).mockResolvedValue({ success: true, pdfPath: 'generated/path/resume.pdf' });

        // 2. Action: Trigger the PDF generation 
        // (This would be called when the user clicks "Generate PDF")
        const result = await generateFinalPdf('job-tailored-123');

        // 3. Assertion: The operation was successful
        expect(result.success).toBe(true);

        // 4. Critical Assertion: The PDF service was called with the MANUALLY EDITED values
        // This verifies that the user's edits are respected and not overwritten by AI defaults
        expect(pdfService.generatePdf).toHaveBeenCalledTimes(1);
        expect(pdfService.generatePdf).toHaveBeenCalledWith(
            'job-tailored-123',
            expect.objectContaining({
                summary: 'This is a manually edited summary specifically for this job.',
                headline: 'Manually Edited Headline',
                skills: ['React', 'TypeScript', 'Vitest']
            }),
            'Senior TypeScript Developer', // Original JD
            undefined, // Deprecated profile path
            'project-a,project-c' // The manually selected projects
        );
    });

    it('should fall back to defaults if no tailoring is present', async () => {
        // Setup: A job with no overrides
        const rawJob = {
            id: 'job-raw-456',
            jobDescription: 'Junior Java Developer',
            status: 'discovered',
            // No tailored fields
        };

        vi.mocked(jobsRepo.getJobById).mockResolvedValue(rawJob as any);
        vi.mocked(pdfService.generatePdf).mockResolvedValue({ success: true, pdfPath: 'path.pdf' });

        await generateFinalPdf('job-raw-456');

        expect(pdfService.generatePdf).toHaveBeenCalledWith(
            'job-raw-456',
            expect.objectContaining({
                summary: '', // Empty if not tailored
                headline: '',
                skills: []
            }),
            'Junior Java Developer',
            undefined, // Deprecated profile path
            undefined // No projects selected
        );
    });
});

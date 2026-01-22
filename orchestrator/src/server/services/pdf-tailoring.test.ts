
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as projectSelection from './projectSelection.js';

// Define mock data in hoisted block
const { mocks, mockProfile } = vi.hoisted(() => {
    const profile = {
        sections: {
            summary: { content: 'Original Summary' },
            skills: { items: ['Original Skill'] },
            projects: { 
                items: [
                    // Start with visible=true to test if they get hidden
                    { id: 'p1', name: 'Project 1', visible: true },
                    { id: 'p2', name: 'Project 2', visible: true }
                ] 
            }
        },
        basics: { headline: 'Original Headline' }
    };

    return {
        mockProfile: profile,
        mocks: {
            readFile: vi.fn(), 
            writeFile: vi.fn(),
            mkdir: vi.fn().mockResolvedValue(undefined),
            access: vi.fn().mockResolvedValue(undefined),
            unlink: vi.fn().mockResolvedValue(undefined),
        }
    };
});

// Configure base mock implementations
mocks.readFile.mockResolvedValue(JSON.stringify(mockProfile));
mocks.writeFile.mockResolvedValue(undefined);

vi.mock('fs/promises', async () => {
    return {
        default: mocks,
        ...mocks
    };
});

vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(true),
    default: { existsSync: vi.fn().mockReturnValue(true) }
}));

vi.mock('../repositories/settings.js', () => ({
  getSetting: vi.fn().mockResolvedValue(null),
  getAllSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('./projectSelection.js', () => ({
    pickProjectIdsForJob: vi.fn().mockResolvedValue([]),
}));

vi.mock('./resumeProjects.js', () => ({
    extractProjectsFromProfile: vi.fn().mockReturnValue({
        catalog: [],
        selectionItems: [
            { id: 'p1', name: 'Project 1' },
            { id: 'p2', name: 'Project 2' }
        ]
    }),
    resolveResumeProjectsSettings: vi.fn().mockReturnValue({
        resumeProjects: {
            lockedProjectIds: [],
            aiSelectableProjectIds: ['p1', 'p2'],
            maxProjects: 3
        }
    })
}));

vi.mock('child_process', () => ({
    spawn: vi.fn().mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event, cb) => {
            if (event === 'close') cb(0);
            return {};
        }),
    })),
    default: {
        spawn: vi.fn().mockImplementation(() => ({
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
            on: vi.fn().mockImplementation((event, cb) => {
                if (event === 'close') cb(0);
                return {};
            }),
        }))
    }
}));

import { generatePdf } from './pdf.js';

describe('PDF Service Tailoring Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks(); 
        
        // Reset default behaviors
        mocks.readFile.mockResolvedValue(JSON.stringify(mockProfile));
        mocks.writeFile.mockResolvedValue(undefined);
    });

    it('should use provided selectedProjectIds and BYPASS AI selection', async () => {
        const tailoredContent = { summary: 'New Sum', headline: 'New Head', skills: [] };
        
        await generatePdf('job-1', tailoredContent, 'Job Desc', 'base.json', 'p2');

        // 1. pickProjectIdsForJob should NOT be called
        expect(projectSelection.pickProjectIdsForJob).not.toHaveBeenCalled();

        // 2. Verify writeFile content
        expect(mocks.writeFile).toHaveBeenCalled();
        const callArgs = mocks.writeFile.mock.calls[0];
        const savedResumeJson = JSON.parse(callArgs[1] as string);
        
        const projects = savedResumeJson.sections.projects.items;
        const p1 = projects.find((p: any) => p.id === 'p1');
        const p2 = projects.find((p: any) => p.id === 'p2');

        expect(p2.visible).toBe(true);
        expect(p1.visible).toBe(false); 

        // 3. Verify Summary Update
        const summary = savedResumeJson.sections.summary.content;
        expect(summary).toBe('New Sum'); 
    });

    it('should handle comma-separated project IDs correctly', async () => {
        await generatePdf('job-2', {}, 'desc', 'base.json', 'p1, p2 ');

        expect(mocks.writeFile).toHaveBeenCalled();
        const callArgs = mocks.writeFile.mock.calls[0];
        const savedResumeJson = JSON.parse(callArgs[1] as string);
        const projects = savedResumeJson.sections.projects.items;

        expect(projects.find((p: any) => p.id === 'p1').visible).toBe(true);
        expect(projects.find((p: any) => p.id === 'p2').visible).toBe(true);
    });
    
    it('should fall back to AI selection if selectedProjectIds is null/undefined', async () => {
        // Setup AI selection mock for this test
        vi.mocked(projectSelection.pickProjectIdsForJob).mockResolvedValue(['p1']);

        await generatePdf('job-3', {}, 'desc', 'base.json', undefined);

        expect(projectSelection.pickProjectIdsForJob).toHaveBeenCalled();
        
        expect(mocks.writeFile).toHaveBeenCalled();
        const callArgs = mocks.writeFile.mock.calls[0];
        const savedResumeJson = JSON.parse(callArgs[1] as string);
        
        const p1 = savedResumeJson.sections.projects.items.find((p: any) => p.id === 'p1');
        const p2 = savedResumeJson.sections.projects.items.find((p: any) => p.id === 'p2');

        expect(p1.visible).toBe(true);
        expect(p2.visible).toBe(false);
        
        const visibleCount = savedResumeJson.sections.projects.items.filter((p:any) => p.visible).length;
        expect(visibleCount).toBe(1);
    });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePdf } from './pdf.js';

// Define mock data in hoisted block
const { mocks, mockProfile } = vi.hoisted(() => {
    const profile = {
        sections: {
            summary: { content: 'Original Summary' },
            skills: {
                items: [
                    { id: 's1', name: 'Existing Skill', visible: true, description: 'Existing Desc', level: 3, keywords: ['k1'] }
                ]
            },
            projects: { items: [] }
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
    extractProjectsFromProfile: vi.fn().mockReturnValue({ catalog: [], selectionItems: [] }),
    resolveResumeProjectsSettings: vi.fn().mockReturnValue({
        resumeProjects: { lockedProjectIds: [], aiSelectableProjectIds: [], maxProjects: 2 }
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

describe('PDF Service Skills Validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.readFile.mockResolvedValue(JSON.stringify(mockProfile));
    });

    it('should add required schema fields (visible, description) to new skills', async () => {
        // AI often returns just name and keywords
        const newSkills = [
            { name: 'New Skill', keywords: ['k2'] },
            { name: 'Existing Skill', keywords: ['k3', 'k4'] } // Should merge with s1
        ];

        const tailoredContent = { skills: newSkills };

        await generatePdf('job-skills-1', tailoredContent, 'Job Desc');

        expect(mocks.writeFile).toHaveBeenCalled();
        const callArgs = mocks.writeFile.mock.calls[0];
        const savedResumeJson = JSON.parse(callArgs[1] as string);

        const skillItems = savedResumeJson.sections.skills.items;

        // Check "New Skill"
        const newSkill = skillItems.find((s: any) => s.name === 'New Skill');
        expect(newSkill).toBeDefined();

        // These are the validations failing in user report:
        expect(newSkill.visible).toBe(true);  // Should default to true
        expect(typeof newSkill.description).toBe('string'); // Should default to ""
        expect(newSkill.description).toBe('');
        // Optional but good to check
        expect(newSkill.id).toBeDefined();
        expect(newSkill.level).toBe(1);

        // Check "Existing Skill" - should preserve existing fields if not overwritten?
        // In the implementation, we look up existing. 
        // existing.visible => true, existing.description => 'Existing Desc', existing.level => 3
        const existingSkill = skillItems.find((s: any) => s.name === 'Existing Skill');
        expect(existingSkill.visible).toBe(true);
        expect(existingSkill.description).toBe('Existing Desc');
        expect(existingSkill.level).toBe(3);
        expect(existingSkill.keywords).toEqual(['k3', 'k4']); // Should use new keywords or existing? Implementation uses new || existing.
    });

    it('should sanitize base resume even if no skills are tailored', async () => {
        // Mock profile has an invalid skill (missing visible/description in the raw json implied, 
        // though our mock above has them. Let's make a truly invalid one locally)
        const invalidProfile = {
            ...mockProfile,
            sections: {
                ...mockProfile.sections,
                skills: {
                    items: [
                        { name: 'Invalid Skill' } // Missing visible, description, id, level
                    ]
                }
            }
        };
        mocks.readFile.mockResolvedValueOnce(JSON.stringify(invalidProfile));

        // No tailoring, pass dummy path to bypass getProfile cache and use readFile mock
        await generatePdf('job-no-tailor', {}, 'Job Desc', 'dummy.json');

        expect(mocks.writeFile).toHaveBeenCalled();
        const callArgs = mocks.writeFile.mock.calls[0];
        const savedResumeJson = JSON.parse(callArgs[1] as string);

        const item = savedResumeJson.sections.skills.items[0];

        // Ensure defaults are applied even if we didn't use the tailoring logic block
        expect(item.visible).toBe(true);
        expect(item.description).toBe('');
        expect(item.id).toBeDefined();
    });
});

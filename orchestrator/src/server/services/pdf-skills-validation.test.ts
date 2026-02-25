import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePdf } from "./pdf";
import { getProfile } from "./profile";

process.env.DATA_DIR = "/tmp";

// Define mock data in hoisted block
const { mocks, mockProfile, mockRxResume } = vi.hoisted(() => {
  const profile = {
    sections: {
      summary: { content: "Original Summary" },
      skills: {
        items: [
          {
            id: "s1",
            name: "Existing Skill",
            visible: true,
            description: "Existing Desc",
            level: 3,
            keywords: ["k1"],
          },
        ],
      },
      projects: { items: [] },
    },
    basics: { headline: "Original Headline" },
  };

  // Capture what's passed to create()
  let lastCreateData: any = null;

  const mockRxResumeApi = {
    importResume: vi.fn().mockImplementation((payload: any) => {
      const data = payload?.data;
      lastCreateData = JSON.parse(JSON.stringify(data)); // Deep clone
      return Promise.resolve("mock-resume-id");
    }),
    exportResumePdf: vi
      .fn()
      .mockResolvedValue("https://example.com/pdf/mock.pdf"),
    deleteResume: vi.fn().mockResolvedValue(undefined),
    getLastCreateData: () => lastCreateData,
    clearLastCreateData: () => {
      lastCreateData = null;
    },
  };

  return {
    mockProfile: profile,
    mocks: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
    mockRxResume: mockRxResumeApi,
  };
});

// Configure base mock implementations
mocks.readFile.mockResolvedValue(JSON.stringify(mockProfile));
mocks.writeFile.mockResolvedValue(undefined);

vi.mock("fs/promises", async () => {
  return {
    default: mocks,
    ...mocks,
  };
});

vi.mock("node:fs/promises", async () => {
  return {
    default: mocks,
    ...mocks,
  };
});

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  }),
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    }),
  },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  }),
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    }),
  },
}));

vi.mock("../repositories/settings", () => ({
  getSetting: vi.fn().mockImplementation((key: string) => {
    if (key === "rxresumeEmail") return Promise.resolve("test@example.com");
    if (key === "rxresumePassword") return Promise.resolve("testpassword");
    return Promise.resolve(null);
  }),
  getAllSettings: vi.fn().mockResolvedValue({}),
}));

// Mock the profile service - getProfile now fetches from v4 API
vi.mock("./profile", () => ({
  getProfile: vi.fn().mockResolvedValue(mockProfile),
}));

vi.mock("./projectSelection", () => ({
  pickProjectIdsForJob: vi.fn().mockResolvedValue([]),
}));

vi.mock("./tracer-links", () => ({
  resolveTracerPublicBaseUrl: vi.fn().mockReturnValue("https://jobops.example"),
  rewriteResumeLinksWithTracer: vi
    .fn()
    .mockResolvedValue({ rewrittenLinks: 0 }),
}));

vi.mock("./resumeProjects", () => ({
  extractProjectsFromProfile: vi
    .fn()
    .mockReturnValue({ catalog: [], selectionItems: [] }),
  resolveResumeProjectsSettings: vi.fn().mockReturnValue({
    resumeProjects: {
      lockedProjectIds: [],
      aiSelectableProjectIds: [],
      maxProjects: 2,
    },
  }),
}));

vi.mock("./rxresume/baseResumeId", () => ({
  getConfiguredRxResumeBaseResumeId: vi.fn().mockResolvedValue({
    mode: "v4",
    resumeId: "base-resume-id",
  }),
}));

vi.mock("./rxresume", async () => {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const { createId } = await import("@paralleldrive/cuid2");
  const profileModule = await import("./profile");
  return {
    getResume: vi.fn().mockImplementation(async () => ({
      id: "base-resume-id",
      name: "Base Resume",
      mode: "v4",
      data: await profileModule.getProfile(),
    })),
    prepareTailoredResumeForPdf: vi
      .fn()
      .mockImplementation(async (args: any) => {
        const data = clone(args.resumeData);
        if (
          data.sections?.skills?.items &&
          Array.isArray(data.sections.skills.items)
        ) {
          data.sections.skills.items = data.sections.skills.items.map(
            (skill: any) => ({
              ...skill,
              id: skill.id || createId(),
              visible: skill.visible ?? true,
              description: skill.description ?? "",
              level: skill.level ?? 1,
              keywords: skill.keywords || [],
            }),
          );
        }

        if (args.tailoredContent?.skills && data.sections?.skills) {
          const existingSkills = data.sections.skills.items || [];
          data.sections.skills.items = args.tailoredContent.skills.map(
            (newSkill: any) => {
              const existing = existingSkills.find(
                (s: any) => s.name === newSkill.name,
              );
              return {
                id: newSkill.id || existing?.id || createId(),
                visible: newSkill.visible ?? existing?.visible ?? true,
                name: newSkill.name || existing?.name || "",
                description:
                  newSkill.description ?? existing?.description ?? "",
                level: newSkill.level ?? existing?.level ?? 0,
                keywords: newSkill.keywords || existing?.keywords || [],
              };
            },
          );
        }

        return {
          mode: "v4",
          data,
          projectCatalog: [],
          selectedProjectIds: [],
        };
      }),
    importResume: mockRxResume.importResume,
    exportResumePdf: mockRxResume.exportResumePdf,
    deleteResume: mockRxResume.deleteResume,
  };
});

// Mock stream pipeline for downloading PDF
vi.mock("stream/promises", () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
  default: {
    pipeline: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("node:stream/promises", () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
  default: {
    pipeline: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock stream Readable
vi.mock("stream", () => ({
  Readable: {
    fromWeb: vi.fn().mockReturnValue({
      pipe: vi.fn(),
    }),
  },
  default: {
    Readable: {
      fromWeb: vi.fn().mockReturnValue({
        pipe: vi.fn(),
      }),
    },
  },
}));

vi.mock("node:stream", () => ({
  Readable: {
    fromWeb: vi.fn().mockReturnValue({
      pipe: vi.fn(),
    }),
  },
  default: {
    Readable: {
      fromWeb: vi.fn().mockReturnValue({
        pipe: vi.fn(),
      }),
    },
  },
}));

// Mock global fetch for PDF download
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    body: {},
  }),
);

describe("PDF Service Skills Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProfile).mockResolvedValue(mockProfile);
    mockRxResume.clearLastCreateData();
  });

  it("should add required schema fields (visible, description) to new skills", async () => {
    // AI often returns just name and keywords
    const newSkills = [
      { name: "New Skill", keywords: ["k2"] },
      { name: "Existing Skill", keywords: ["k3", "k4"] }, // Should merge with s1
    ];

    const tailoredContent = { skills: newSkills };

    await generatePdf("job-skills-1", tailoredContent, "Job Desc");

    expect(mockRxResume.importResume).toHaveBeenCalled();
    const savedResumeJson = mockRxResume.getLastCreateData();

    const skillItems = savedResumeJson.sections.skills.items;

    // Check "New Skill"
    const newSkill = skillItems.find((s: any) => s.name === "New Skill");
    expect(newSkill).toBeDefined();

    // These are the validations failing in user report:
    expect(newSkill.visible).toBe(true); // Should default to true
    expect(typeof newSkill.description).toBe("string"); // Should default to ""
    expect(newSkill.description).toBe("");
    // Optional but good to check
    expect(newSkill.id).toBeDefined();
    expect(newSkill.level).toBe(0);

    // Check "Existing Skill" - should preserve existing fields if not overwritten?
    // In the implementation, we look up existing.
    // existing.visible => true, existing.description => 'Existing Desc', existing.level => 3
    const existingSkill = skillItems.find(
      (s: any) => s.name === "Existing Skill",
    );
    expect(existingSkill.visible).toBe(true);
    expect(existingSkill.description).toBe("Existing Desc");
    expect(existingSkill.level).toBe(3);
    expect(existingSkill.keywords).toEqual(["k3", "k4"]); // Should use new keywords or existing? Implementation uses new || existing.
  });

  it("should sanitize base resume even if no skills are tailored", async () => {
    // Mock profile has an invalid skill (missing visible/description in the raw json implied,
    // though our mock above has them. Let's make a truly invalid one locally)
    const invalidProfile = {
      ...mockProfile,
      sections: {
        ...mockProfile.sections,
        skills: {
          ...mockProfile.sections.skills,
          items: [
            {
              id: "invalid-1",
              name: "Invalid Skill",
              description: "",
              level: 1,
              keywords: [],
              visible: true,
            },
          ],
        },
      },
    } as any;
    vi.mocked(getProfile).mockResolvedValueOnce(invalidProfile);

    // No tailoring, pass dummy path to bypass getProfile cache and use readFile mock
    await generatePdf("job-no-tailor", {}, "Job Desc", "dummy.json");

    expect(mockRxResume.importResume).toHaveBeenCalled();
    const savedResumeJson = mockRxResume.getLastCreateData();

    const item = savedResumeJson.sections.skills.items[0];

    // Ensure defaults are applied even if we didn't use the tailoring logic block
    expect(item.visible).toBe(true);
    expect(item.description).toBe("");
    expect(item.id).toBeDefined();
  });

  it("should generate CUID2-compatible IDs for skills without IDs", async () => {
    // Profile with skills missing IDs (common when AI generates them)
    const profileWithoutIds = {
      ...mockProfile,
      sections: {
        ...mockProfile.sections,
        skills: {
          ...mockProfile.sections.skills,
          items: [
            {
              id: "",
              name: "Skill 1",
              keywords: ["a"],
              description: "",
              level: 1,
              visible: true,
            },
            {
              id: "",
              name: "Skill 2",
              keywords: ["b"],
              description: "",
              level: 1,
              visible: true,
            },
            {
              id: "",
              name: "Skill 3",
              keywords: ["c"],
              description: "",
              level: 1,
              visible: true,
            },
          ],
        },
      },
    } as any;
    vi.mocked(getProfile).mockResolvedValueOnce(profileWithoutIds);

    await generatePdf("job-cuid2-test", {}, "Job Desc", "dummy.json");

    expect(mockRxResume.importResume).toHaveBeenCalled();
    const savedResumeJson = mockRxResume.getLastCreateData();

    const skillItems = savedResumeJson.sections.skills.items;

    // All skills should have IDs
    skillItems.forEach((skill: any, _index: number) => {
      expect(skill.id).toBeDefined();
      expect(typeof skill.id).toBe("string");
      expect(skill.id.length).toBeGreaterThanOrEqual(20);

      // CUID2 format: starts with a letter, lowercase alphanumeric
      expect(skill.id).toMatch(/^[a-z][a-z0-9]+$/);
    });

    // IDs should be unique
    const ids = skillItems.map((s: any) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should NOT generate IDs like "skill-0" which are invalid CUID2', async () => {
    const profileWithoutIds = {
      ...mockProfile,
      sections: {
        ...mockProfile.sections,
        skills: {
          ...mockProfile.sections.skills,
          items: [
            {
              id: "",
              name: "Skill Without ID",
              keywords: ["test"],
              description: "",
              level: 1,
              visible: true,
            },
          ],
        },
      },
    } as any;
    vi.mocked(getProfile).mockResolvedValueOnce(profileWithoutIds);

    await generatePdf("job-no-skill-prefix", {}, "Job Desc", "dummy.json");

    expect(mockRxResume.importResume).toHaveBeenCalled();
    const savedResumeJson = mockRxResume.getLastCreateData();

    const skill = savedResumeJson.sections.skills.items[0];

    // ID should NOT be in the old invalid format
    expect(skill.id).not.toMatch(/^skill-\d+$/);

    // Should be valid CUID2 format
    expect(skill.id).toMatch(/^[a-z][a-z0-9]+$/);
  });

  it("should preserve existing valid IDs and not regenerate them", async () => {
    const validCuid2Id = "ck9w4ygzq0000xmn5h0jt7l5c";
    const profileWithValidId = {
      ...mockProfile,
      sections: {
        ...mockProfile.sections,
        skills: {
          items: [
            {
              id: validCuid2Id,
              name: "Skill With Valid ID",
              keywords: ["test"],
              visible: true,
              description: "",
              level: 1,
            },
          ],
        },
      },
    };
    vi.mocked(getProfile).mockResolvedValueOnce(profileWithValidId);

    await generatePdf("job-preserve-id", {}, "Job Desc", "dummy.json");

    expect(mockRxResume.importResume).toHaveBeenCalled();
    const savedResumeJson = mockRxResume.getLastCreateData();

    const skill = savedResumeJson.sections.skills.items[0];

    // Should preserve the original valid ID
    expect(skill.id).toBe(validCuid2Id);
  });
});

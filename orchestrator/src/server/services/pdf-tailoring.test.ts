import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePdf } from "./pdf.js";
import * as projectSelection from "./projectSelection.js";

// Define mock data in hoisted block
const { mocks, mockProfile, mockRxResumeClient } = vi.hoisted(() => {
  const profile = {
    sections: {
      summary: { content: "Original Summary" },
      skills: { items: ["Original Skill"] },
      projects: {
        items: [
          // Start with visible=true to test if they get hidden
          { id: "p1", name: "Project 1", visible: true },
          { id: "p2", name: "Project 2", visible: true },
        ],
      },
    },
    basics: { headline: "Original Headline" },
  };

  // Capture what's passed to create()
  let lastCreateData: any = null;

  const mockClient = {
    create: vi.fn().mockImplementation((data: any) => {
      lastCreateData = JSON.parse(JSON.stringify(data)); // Deep clone
      return Promise.resolve("mock-resume-id");
    }),
    print: vi.fn().mockResolvedValue("https://example.com/pdf/mock.pdf"),
    delete: vi.fn().mockResolvedValue(undefined),
    withAutoRefresh: vi
      .fn()
      .mockImplementation(
        async (
          _email: string,
          _password: string,
          operation: (token: string) => Promise<any>,
        ) => {
          return operation("mock-token");
        },
      ),
    getToken: vi.fn().mockResolvedValue("mock-token"),
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
    mockRxResumeClient: mockClient,
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
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  }),
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    }),
  },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  }),
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    }),
  },
}));

vi.mock("../repositories/settings.js", () => ({
  getSetting: vi.fn().mockImplementation((key: string) => {
    if (key === "rxresumeEmail") return Promise.resolve("test@example.com");
    if (key === "rxresumePassword") return Promise.resolve("testpassword");
    return Promise.resolve(null);
  }),
  getAllSettings: vi.fn().mockResolvedValue({}),
}));

// Mock the profile service - getProfile now fetches from v4 API
vi.mock("./profile.js", () => ({
  getProfile: vi.fn().mockResolvedValue(mockProfile),
}));

vi.mock("./projectSelection.js", () => ({
  pickProjectIdsForJob: vi.fn().mockResolvedValue([]),
}));

vi.mock("./resumeProjects.js", () => ({
  extractProjectsFromProfile: vi.fn().mockReturnValue({
    catalog: [],
    selectionItems: [
      { id: "p1", name: "Project 1" },
      { id: "p2", name: "Project 2" },
    ],
  }),
  resolveResumeProjectsSettings: vi.fn().mockReturnValue({
    resumeProjects: {
      lockedProjectIds: [],
      aiSelectableProjectIds: ["p1", "p2"],
      maxProjects: 3,
    },
  }),
}));

// Mock the RxResumeClient
vi.mock("./rxresume-client.js", () => ({
  RxResumeClient: vi.fn().mockImplementation(function (this: any) {
    return mockRxResumeClient;
  }),
}));

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

// Mock global fetch
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    body: {},
  }),
);

describe("PDF Service Tailoring Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readFile.mockResolvedValue(JSON.stringify(mockProfile));
    mockRxResumeClient.clearLastCreateData();
  });

  it("should use provided selectedProjectIds and BYPASS AI selection", async () => {
    const tailoredContent = {
      summary: "New Sum",
      headline: "New Head",
      skills: [],
    };

    await generatePdf("job-1", tailoredContent, "Job Desc", "base.json", "p2");

    // 1. pickProjectIdsForJob should NOT be called
    expect(projectSelection.pickProjectIdsForJob).not.toHaveBeenCalled();

    // 2. Verify create data content
    expect(mockRxResumeClient.create).toHaveBeenCalled();
    const savedResumeJson = mockRxResumeClient.getLastCreateData();

    const projects = savedResumeJson.sections.projects.items;
    const p1 = projects.find((p: any) => p.id === "p1");
    const p2 = projects.find((p: any) => p.id === "p2");

    expect(p2.visible).toBe(true);
    expect(p1.visible).toBe(false);

    // 3. Verify Summary Update
    const summary = savedResumeJson.sections.summary.content;
    expect(summary).toBe("New Sum");
  });

  it("should handle comma-separated project IDs correctly", async () => {
    await generatePdf("job-2", {}, "desc", "base.json", "p1, p2 ");

    expect(mockRxResumeClient.create).toHaveBeenCalled();
    const savedResumeJson = mockRxResumeClient.getLastCreateData();
    const projects = savedResumeJson.sections.projects.items;

    expect(projects.find((p: any) => p.id === "p1").visible).toBe(true);
    expect(projects.find((p: any) => p.id === "p2").visible).toBe(true);
  });

  it("should fall back to AI selection if selectedProjectIds is null/undefined", async () => {
    // Setup AI selection mock for this test
    vi.mocked(projectSelection.pickProjectIdsForJob).mockResolvedValue(["p1"]);

    await generatePdf("job-3", {}, "desc", "base.json", undefined);

    expect(projectSelection.pickProjectIdsForJob).toHaveBeenCalled();

    expect(mockRxResumeClient.create).toHaveBeenCalled();
    const savedResumeJson = mockRxResumeClient.getLastCreateData();

    const p1 = savedResumeJson.sections.projects.items.find(
      (p: any) => p.id === "p1",
    );
    const p2 = savedResumeJson.sections.projects.items.find(
      (p: any) => p.id === "p2",
    );

    expect(p1.visible).toBe(true);
    expect(p2.visible).toBe(false);

    const visibleCount = savedResumeJson.sections.projects.items.filter(
      (p: any) => p.visible,
    ).length;
    expect(visibleCount).toBe(1);
  });
});

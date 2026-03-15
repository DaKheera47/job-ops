import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
import { vi } from "vitest";

const mockCanonicalResumeSelection = vi.hoisted(() => {
  const timestamp = "2026-03-15T00:00:00.000Z";

  const buildSelection = () => ({
    workspace: {
      id: "workspace-test",
      name: "Test Workspace",
      slug: "test-workspace",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    profile: {
      id: "profile-test",
      workspaceId: "workspace-test",
      label: "Primary",
      isDefault: true,
      lane: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    canonicalResume: {
      id: "canonical-resume-test",
      workspaceId: "workspace-test",
      profileId: "profile-test",
      source: "rxresume" as const,
      rxresumeResumeId: "resume-test",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });

  const buildProfile = () => ({
    basics: {
      name: "Test Resume",
      headline: "Test Headline",
    },
    sections: {
      summary: {
        content: "Test summary",
      },
      projects: {
        items: [],
      },
    },
  });

  return {
    buildSelection,
    buildAccess: () => ({
      ...buildSelection(),
      resume: {
        id: "resume-test",
        name: "Test Resume",
        mode: "v5" as const,
        data: buildProfile(),
      },
    }),
    getCanonicalResumeSelection: vi.fn(async () => buildSelection()),
    getCanonicalResumeAccess: vi.fn(async () => ({
      ...buildSelection(),
      resume: {
        id: "resume-test",
        name: "Test Resume",
        mode: "v5" as const,
        data: buildProfile(),
      },
    })),
  };
});

const mockProfileService = vi.hoisted(() => ({
  getProfile: vi.fn(
    async () => mockCanonicalResumeSelection.buildAccess().resume.data,
  ),
  getPersonName: vi.fn(async () => "Test Resume"),
  clearProfileCache: vi.fn(),
}));

vi.mock("@server/pipeline/index", () => {
  const progress = {
    step: "idle",
    message: "Ready",
    crawlingSource: null,
    crawlingSourcesCompleted: 0,
    crawlingSourcesTotal: 0,
    crawlingTermsProcessed: 0,
    crawlingTermsTotal: 0,
    crawlingListPagesProcessed: 0,
    crawlingListPagesTotal: 0,
    crawlingJobCardsFound: 0,
    crawlingJobPagesEnqueued: 0,
    crawlingJobPagesSkipped: 0,
    crawlingJobPagesProcessed: 0,
    jobsDiscovered: 0,
    jobsScored: 0,
    jobsProcessed: 0,
    totalToProcess: 0,
  };

  return {
    runPipeline: vi.fn().mockResolvedValue({
      success: true,
      jobsDiscovered: 0,
      jobsProcessed: 0,
    }),
    processJob: vi.fn().mockResolvedValue({ success: true }),
    summarizeJob: vi.fn().mockResolvedValue({ success: true }),
    generateFinalPdf: vi.fn().mockResolvedValue({ success: true }),
    getPipelineStatus: vi.fn(() => ({ isRunning: false })),
    requestPipelineCancel: vi.fn(() => ({
      accepted: false,
      pipelineRunId: null,
      alreadyRequested: false,
    })),
    isPipelineCancelRequested: vi.fn(() => false),
    subscribeToProgress: vi.fn((listener: (data: unknown) => void) => {
      listener(progress);
      return () => {};
    }),
    progressHelpers: {
      complete: vi.fn(),
    },
  };
});

vi.mock("@server/services/manualJob", () => ({
  inferManualJobDetails: vi.fn(),
}));

vi.mock("@server/services/scorer", () => ({
  scoreJobSuitability: vi.fn(),
}));

vi.mock("@server/services/platform/resumeStudio", () => ({
  getCanonicalResumeSelection:
    mockCanonicalResumeSelection.getCanonicalResumeSelection,
  getCanonicalResumeAccess:
    mockCanonicalResumeSelection.getCanonicalResumeAccess,
}));
vi.mock("../../services/platform/resumeStudio", () => ({
  getCanonicalResumeSelection:
    mockCanonicalResumeSelection.getCanonicalResumeSelection,
  getCanonicalResumeAccess:
    mockCanonicalResumeSelection.getCanonicalResumeAccess,
}));

vi.mock("@server/services/profile", () => ({
  getProfile: mockProfileService.getProfile,
  getPersonName: mockProfileService.getPersonName,
  clearProfileCache: mockProfileService.clearProfileCache,
}));

vi.mock("@server/services/visa-sponsors/index", () => ({
  getStatus: vi.fn(),
  searchSponsors: vi.fn(),
  getOrganizationDetails: vi.fn(),
  downloadLatestCsv: vi.fn(),
  calculateSponsorMatchSummary: vi.fn((results) => {
    if (!results || results.length === 0)
      return { sponsorMatchScore: 0, sponsorMatchNames: null };
    return {
      sponsorMatchScore: results[0].score,
      sponsorMatchNames: JSON.stringify(
        results.map((r: any) => r.sponsor.organisationName),
      ),
    };
  }),
}));

const originalEnv = { ...process.env };

export async function startServer(options?: {
  env?: Record<string, string | undefined>;
}): Promise<{
  server: Server;
  baseUrl: string;
  closeDb: () => void;
  tempDir: string;
}> {
  vi.resetModules();
  const tempRoot = join(process.cwd(), ".tmp", "api-route-tests");
  await mkdir(tempRoot, { recursive: true });
  const tempDir = await mkdtemp(join(tempRoot, "job-ops-api-test-"));
  const envOverrides = options?.env ?? {};
  process.env = {
    ...originalEnv,
    DATA_DIR: tempDir,
    NODE_ENV: "test",
    MODEL: "test-model",
    JOBSPY_SEARCH_TERMS: "alpha|beta",
    ...envOverrides,
  };

  await import("@server/db/migrate");
  const { applyStoredEnvOverrides } = await import(
    "@server/services/envSettings"
  );
  const { createApp } = await import("../../app");
  const { closeDb } = await import("@server/db/index");
  const { getPipelineStatus } = await import("@server/pipeline/index");
  vi.mocked(getPipelineStatus).mockReturnValue({ isRunning: false });

  await applyStoredEnvOverrides();

  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve server address");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    closeDb,
    tempDir,
  };
}

export async function stopServer(args: {
  server: Server;
  closeDb: () => void;
  tempDir?: string;
}) {
  // Defensive: if startServer throws, callers may still run cleanup.
  if (args.server) {
    await new Promise<void>((resolve) => args.server.close(() => resolve()));
  }
  if (args.closeDb) {
    args.closeDb();
  }
  if (args.tempDir) {
    await rm(args.tempDir, { recursive: true, force: true });
  }
  process.env = { ...originalEnv };
  vi.clearAllMocks();
}

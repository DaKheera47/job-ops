import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

vi.mock("../../pipeline/index", () => {
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

vi.mock("../../services/notion", () => ({
  createNotionEntry: vi.fn(),
}));

vi.mock("../../services/manualJob", () => ({
  inferManualJobDetails: vi.fn(),
}));

vi.mock("../../services/scorer", () => ({
  scoreJobSuitability: vi.fn(),
}));

vi.mock("../../services/profile", () => ({
  getProfile: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../services/ukvisajobs", () => ({
  fetchUkVisaJobsPage: vi.fn(),
}));

vi.mock("../../services/visa-sponsors/index", () => ({
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
  const tempDir = await mkdtemp(join(tmpdir(), "job-ops-api-test-"));
  const envOverrides = options?.env ?? {};
  process.env = {
    ...originalEnv,
    DATA_DIR: tempDir,
    NODE_ENV: "test",
    MODEL: "test-model",
    JOBSPY_SEARCH_TERMS: "alpha|beta",
    ...envOverrides,
  };

  await import("../../db/migrate");
  const { applyStoredEnvOverrides } = await import(
    "../../services/envSettings"
  );
  const { createApp } = await import("../../app");
  const { closeDb } = await import("../../db/index");
  const { getPipelineStatus } = await import("../../pipeline/index");
  vi.mocked(getPipelineStatus).mockReturnValue({ isRunning: false });

  await applyStoredEnvOverrides();

  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
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

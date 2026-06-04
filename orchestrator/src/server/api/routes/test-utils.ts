import { copyFile, mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtractorRegistry } from "@server/extractors/registry";
import {
  type ExtractorSourceId,
  PIPELINE_EXTRACTOR_SOURCE_IDS,
} from "@shared/extractors";
import { normalizeLocationSourceCapabilities } from "@shared/location-domain.js";
import type { ExtractorManifest } from "@shared/types";
import { vi } from "vitest";

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
    getProgress: vi.fn(() => ({ ...progress })),
    requestPipelineCancel: vi.fn(() => ({
      accepted: false,
      pipelineRunId: null,
      alreadyRequested: false,
    })),
    isPipelineCancelRequested: vi.fn(() => false),
    getPendingChallenges: vi.fn(() => []),
    resolvePipelineChallenge: vi.fn(() => ({ resolved: false, remaining: 0 })),
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

vi.mock("@server/services/job-brief", () => ({
  generateJobBrief: vi.fn().mockResolvedValue(null),
}));

vi.mock("@server/services/profile", () => ({
  getProfile: vi.fn().mockResolvedValue({}),
  clearProfileCache: vi.fn(),
}));

vi.mock("@server/services/activation-funnel", () => ({
  trackCanonicalActivationEvent: vi.fn().mockResolvedValue(true),
  initializeActivationAnalytics: vi.fn().mockResolvedValue(undefined),
  initializeActivationAnalyticsSafely: vi.fn().mockResolvedValue(undefined),
  reconcileActivationMilestonesFromHistory: vi
    .fn()
    .mockResolvedValue(undefined),
  reconcileActivationMilestonesFromHistorySafely: vi
    .fn()
    .mockResolvedValue(undefined),
}));

vi.mock("@server/services/challenge-viewer", () => ({
  ensureChallengeViewer: vi
    .fn()
    .mockResolvedValue({ available: false, reason: "not a container" }),
  createChallengeViewerSession: vi.fn(() => ({ token: "viewer-token" })),
  buildChallengeViewerUrl: vi.fn(
    () => "/challenge-viewer/session/viewer-token/vnc.html",
  ),
  proxyChallengeViewerRequest: vi.fn(),
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
const isolatedEnvKeys = [
  "RXRESUME_API_KEY",
  "RXRESUME_EMAIL",
  "RXRESUME_PASSWORD",
  "RXRESUME_URL",
  "RXRESUME_MODE",
  "LLM_API_KEY",
  "LLM_PROVIDER",
  "LLM_BASE_URL",
  "BASIC_AUTH_USER",
  "BASIC_AUTH_PASSWORD",
  "JWT_SECRET",
  "JWT_EXPIRY_SECONDS",
  "JOBOPS_APP_MODE",
  "JOBOPS_HOSTED_PLATFORM_LLM_ENABLED",
  "JOBOPS_HOSTED_QUOTAS_ENABLED",
  "JOBOPS_HOSTED_SIGNUPS_ENABLED",
  "JOBOPS_HOSTED_TENANT_ID",
  "WEBHOOK_SECRET",
  "UKVISAJOBS_EMAIL",
  "UKVISAJOBS_PASSWORD",
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
] as const;

const nativeFetch = globalThis.fetch;
const nativeConsoleLog = console.log;
const nativeConsoleWarn = console.warn;
const nativeConsoleError = console.error;
let migratedDbTemplatePromise: Promise<string> | null = null;

function createTestExtractorRegistry(): ExtractorRegistry {
  const manifests = new Map<string, ExtractorManifest>();
  const manifestBySource = new Map<ExtractorSourceId, ExtractorManifest>();

  for (const source of PIPELINE_EXTRACTOR_SOURCE_IDS) {
    const manifest: ExtractorManifest = {
      id: `test-${source}`,
      displayName: `Test ${source}`,
      providesSources: [source],
      run: vi.fn().mockResolvedValue({
        success: true,
        jobs: [],
      }),
    };
    manifests.set(manifest.id, manifest);
    manifestBySource.set(source, manifest);
  }

  return {
    manifests,
    manifestBySource,
    availableSources: [...PIPELINE_EXTRACTOR_SOURCE_IDS],
    locationCapabilitiesBySource: Object.fromEntries(
      Array.from(manifestBySource.keys()).map((source) => [
        source,
        normalizeLocationSourceCapabilities({ source }),
      ]),
    ),
  };
}

function restoreNativeFetch(): void {
  globalThis.fetch = nativeFetch;
}

async function importMigrationsSilently(): Promise<void> {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};

  try {
    await import("@server/db/migrate");
  } finally {
    console.log = nativeConsoleLog;
    console.warn = nativeConsoleWarn;
    console.error = nativeConsoleError;
  }
}

function buildBaseTestEnv(): NodeJS.ProcessEnv {
  const nextEnv = { ...originalEnv };
  for (const key of isolatedEnvKeys) {
    delete nextEnv[key];
  }

  return {
    ...nextEnv,
    NODE_ENV: "test",
    JOBOPS_TEST_AUTH_BYPASS: "1",
    MODEL: "test-model",
    JOBSPY_SEARCH_TERMS: "alpha|beta",
  };
}

async function ensureMigratedDbTemplate(): Promise<string> {
  if (migratedDbTemplatePromise) {
    return migratedDbTemplatePromise;
  }

  migratedDbTemplatePromise = (async () => {
    const templateDir = await mkdtemp(join(tmpdir(), "job-ops-api-template-"));
    const previousEnv = process.env;

    try {
      process.env = {
        ...buildBaseTestEnv(),
        DATA_DIR: templateDir,
      };
      await importMigrationsSilently();
    } finally {
      process.env = previousEnv;
    }

    return join(templateDir, "jobs.db");
  })();

  return migratedDbTemplatePromise;
}

export async function startServer(options?: {
  env?: Record<string, string | undefined>;
}): Promise<{
  server: Server;
  baseUrl: string;
  closeDb: () => void;
  tempDir: string;
}> {
  vi.unstubAllGlobals();
  restoreNativeFetch();
  vi.resetModules();
  const tempDir = await mkdtemp(join(tmpdir(), "job-ops-api-test-"));
  const envOverrides = options?.env ?? {};
  const requiresLegacyBasicAuthSeed =
    typeof envOverrides.BASIC_AUTH_USER === "string" &&
    envOverrides.BASIC_AUTH_USER.trim().length > 0 &&
    typeof envOverrides.BASIC_AUTH_PASSWORD === "string" &&
    envOverrides.BASIC_AUTH_PASSWORD.trim().length > 0;

  process.env = {
    ...buildBaseTestEnv(),
    DATA_DIR: tempDir,
    ...envOverrides,
  };

  if (requiresLegacyBasicAuthSeed) {
    await importMigrationsSilently();
  } else {
    await copyFile(await ensureMigratedDbTemplate(), join(tempDir, "jobs.db"));
  }
  const { applyStoredEnvOverrides } = await import(
    "@server/services/envSettings"
  );
  const registryModule = await import("@server/extractors/registry");
  const defaultRegistry = createTestExtractorRegistry();
  if (vi.isMockFunction(registryModule.getExtractorRegistry)) {
    vi.mocked(registryModule.getExtractorRegistry).mockResolvedValue(
      defaultRegistry,
    );
  } else {
    vi.spyOn(registryModule, "getExtractorRegistry").mockResolvedValue(
      defaultRegistry,
    );
  }
  const { createApp } = await import("../../app");
  const { closeDb } = await import("@server/db/index");
  const { getPipelineStatus } = await import("@server/pipeline/index");
  vi.mocked(getPipelineStatus).mockReturnValue({ isRunning: false });

  await applyStoredEnvOverrides();

  const app = createApp();
  const server = await new Promise<Server>((resolve, reject) => {
    let listeningServer: Server;
    listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer),
    );
    listeningServer.once("error", reject);
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
  vi.unstubAllGlobals();
  restoreNativeFetch();
  vi.clearAllMocks();
}

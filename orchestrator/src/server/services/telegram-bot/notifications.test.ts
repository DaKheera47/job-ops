import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pipeline completion notifications + LLM-pause classification — the
 * primary transparency surface for the user after each pipeline run.
 *
 * What we pin:
 *
 *  • `buildCompletionMessage` includes the full pre-scoring funnel
 *    (relocation / anti-domain / language / no-signal) whenever the
 *    corresponding metric is non-zero, AND hides each line when the
 *    metric is zero or absent.  This is the contract that lets the user
 *    answer "where did this strange job come from?" — silently dropping
 *    a metric was the May 2026 regression that motivated the whole
 *    transparency rework.
 *
 *  • `screeningDegraded` lights up a prominent ⚠️ banner — without it
 *    users keep seeing off-target jobs and never realise their resume
 *    failed to load.
 *
 *  • `isTransientConfigurationReason` correctly distinguishes "AI
 *    temporarily unavailable" (Resume / Cancel CTAs) from a genuine
 *    config error (Settings / Resume / Cancel CTAs).  Misclassifying
 *    sends the user to the wrong remediation.
 */

vi.mock("../../repositories/pipeline", () => ({
  getLatestPipelineRunWithDetails: vi.fn(),
}));

// The notifications module subscribes at import-time via these helpers; we
// don't exercise the subscription path here, but they need to import cleanly.
vi.mock("../../pipeline/progress", () => ({
  subscribeToProgress: vi.fn(() => () => {}),
}));
vi.mock("../linkedin-auto-apply/batch", () => ({
  subscribeToBatchProgress: vi.fn(() => () => {}),
}));
vi.mock("./auth", () => ({
  areNotificationsEnabled: vi.fn().mockResolvedValue(false),
  getAuthorizedChatIds: vi.fn().mockResolvedValue(new Set<number>()),
}));
vi.mock("./bot", () => ({
  getBot: vi.fn(() => null),
}));

describe.sequential("buildCompletionMessage", () => {
  let mod: typeof import("./notifications");
  let pipelineRepo: typeof import("../../repositories/pipeline");

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock("../../repositories/pipeline", () => ({
      getLatestPipelineRunWithDetails: vi.fn(),
    }));
    vi.doMock("../../pipeline/progress", () => ({
      subscribeToProgress: vi.fn(() => () => {}),
    }));
    vi.doMock("../linkedin-auto-apply/batch", () => ({
      subscribeToBatchProgress: vi.fn(() => () => {}),
    }));
    vi.doMock("./auth", () => ({
      areNotificationsEnabled: vi.fn().mockResolvedValue(false),
      getAuthorizedChatIds: vi.fn().mockResolvedValue(new Set<number>()),
    }));
    vi.doMock("./bot", () => ({
      getBot: vi.fn(() => null),
    }));

    pipelineRepo = await import("../../repositories/pipeline");
    mod = await import("./notifications");
  });

  afterEach(() => {
    vi.doUnmock("../../repositories/pipeline");
    vi.doUnmock("../../pipeline/progress");
    vi.doUnmock("../linkedin-auto-apply/batch");
    vi.doUnmock("./auth");
    vi.doUnmock("./bot");
  });

  it("returns a generic completion line when no run details are saved", async () => {
    vi.mocked(pipelineRepo.getLatestPipelineRunWithDetails).mockResolvedValue(
      null,
    );

    const msg = await mod.buildCompletionMessage();
    expect(msg).toMatch(/Pipeline Complete/i);
  });

  it("returns a generic completion line when the repo throws", async () => {
    vi.mocked(pipelineRepo.getLatestPipelineRunWithDetails).mockRejectedValue(
      new Error("DB down"),
    );

    const msg = await mod.buildCompletionMessage();
    expect(msg).toMatch(/Pipeline Complete/i);
  });

  it("renders every pre-scoring filter line when its metric is non-zero", async () => {
    vi.mocked(pipelineRepo.getLatestPipelineRunWithDetails).mockResolvedValue({
      run: {
        id: "r1",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "completed",
        jobsDiscovered: 100,
        jobsProcessed: 12,
        errorMessage: null,
        funnel: {
          searched: 800,
          deduplicated: 50,
          livenessFiltered: 5,
          expired: 0,
          scored: 200,
          autoSkipped: 30,
          selected: 12,
          ghostFlagged: 3,
        },
      },
      savedDetails: {
        requestedConfig: {} as any,
        effectiveConfig: {} as any,
        resultSummary: {
          stage: "completed",
          jobsScored: 200,
          jobsSelected: 12,
          sourceErrors: [],
          filterMetrics: {
            relocationSkipped: 412,
            antiDomainSkipped: 88,
            antiDomainByReason: { healthcare: 40, field_sales: 30, legal: 18 },
            languageGateSkipped: 9,
            noResumeSignalSkipped: 5,
            scoringTransientFailures: 7,
          },
        },
      },
    } as any);

    const msg = await mod.buildCompletionMessage();
    // Top-line funnel.
    expect(msg).toMatch(/Searched.*800/);
    expect(msg).toMatch(/Imported.*100/);
    // Each pre-scoring filter line.
    expect(msg).toMatch(/Relocation.*412/);
    expect(msg).toMatch(/Wrong domain.*88/);
    expect(msg).toContain("healthcare");
    expect(msg).toMatch(/Language.*9/);
    expect(msg).toMatch(/keyword overlap.*5/);
    // Scoring + tailored.
    expect(msg).toMatch(/Scored by AI.*200/);
    expect(msg).toMatch(/transient AI failures/);
    expect(msg).toMatch(/Tailored.*12/);
    // Pre-scoring filters header should appear when any metric is non-zero.
    expect(msg).toMatch(/Pre-scoring filters/i);
  });

  it("hides each filter line when its metric is zero", async () => {
    vi.mocked(pipelineRepo.getLatestPipelineRunWithDetails).mockResolvedValue({
      run: {
        id: "r1",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "completed",
        jobsDiscovered: 100,
        jobsProcessed: 12,
        errorMessage: null,
        funnel: {
          searched: 500,
          deduplicated: 10,
          livenessFiltered: 0,
          expired: 0,
          scored: 100,
          autoSkipped: 0,
          selected: 12,
          ghostFlagged: 0,
        },
      },
      savedDetails: {
        requestedConfig: {} as any,
        effectiveConfig: {} as any,
        resultSummary: {
          stage: "completed",
          jobsScored: 100,
          jobsSelected: 12,
          sourceErrors: [],
          filterMetrics: {
            relocationSkipped: 0,
            antiDomainSkipped: 0,
            languageGateSkipped: 0,
            noResumeSignalSkipped: 0,
          },
        },
      },
    } as any);

    const msg = await mod.buildCompletionMessage();
    expect(msg).not.toMatch(/Relocation/);
    expect(msg).not.toMatch(/Wrong domain/);
    expect(msg).not.toMatch(/Language/);
    expect(msg).not.toMatch(/keyword overlap/);
    // The "Pre-scoring filters" header should not appear if no rows.
    expect(msg).not.toMatch(/Pre-scoring filters/i);
  });

  it("renders a prominent warning when screeningDegraded is true", async () => {
    vi.mocked(pipelineRepo.getLatestPipelineRunWithDetails).mockResolvedValue({
      run: {
        id: "r1",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: "completed",
        jobsDiscovered: 50,
        jobsProcessed: 0,
        errorMessage: null,
        funnel: {
          searched: 100,
          deduplicated: 5,
          livenessFiltered: 0,
          expired: 0,
          scored: 50,
          autoSkipped: 0,
          selected: 0,
          ghostFlagged: 0,
        },
      },
      savedDetails: {
        requestedConfig: {} as any,
        effectiveConfig: {} as any,
        resultSummary: {
          stage: "completed",
          jobsScored: 50,
          jobsSelected: 0,
          sourceErrors: [],
          filterMetrics: {
            screeningDegraded: true,
            screeningDegradationReason: "no_design_resume",
          },
        },
      },
    } as any);

    const msg = await mod.buildCompletionMessage();
    expect(msg).toContain("⚠️");
    expect(msg).toMatch(/degraded/i);
    expect(msg).toContain("no_design_resume");
  });
});

describe("isTransientConfigurationReason", () => {
  let mod: typeof import("./notifications");

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../../repositories/pipeline", () => ({
      getLatestPipelineRunWithDetails: vi.fn(),
    }));
    vi.doMock("../../pipeline/progress", () => ({
      subscribeToProgress: vi.fn(() => () => {}),
    }));
    vi.doMock("../linkedin-auto-apply/batch", () => ({
      subscribeToBatchProgress: vi.fn(() => () => {}),
    }));
    vi.doMock("./auth", () => ({
      areNotificationsEnabled: vi.fn().mockResolvedValue(false),
      getAuthorizedChatIds: vi.fn().mockResolvedValue(new Set<number>()),
    }));
    vi.doMock("./bot", () => ({
      getBot: vi.fn(() => null),
    }));
    mod = await import("./notifications");
  });

  it.each([
    "AI temporarily unavailable",
    "Rate-limited by GNAI",
    "rate limit exceeded",
    "Provider may be down — retry in a few minutes",
    "Scoring failed for 35% of jobs in this run",
  ])("flags %j as transient", (reason) => {
    expect(mod.isTransientConfigurationReason(reason)).toBe(true);
  });

  it.each([
    "LLM API key not configured",
    "Invalid API key for provider openai",
    "Settings: no provider configured",
    "401 Unauthorized from upstream",
  ])("flags %j as config (not transient)", (reason) => {
    expect(mod.isTransientConfigurationReason(reason)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(mod.isTransientConfigurationReason("RATE LIMIT")).toBe(true);
    expect(mod.isTransientConfigurationReason("TEMPORARILY")).toBe(true);
  });
});

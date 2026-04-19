import { renderWithQueryClient } from "@client/test/renderWithQueryClient";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewPipelineRunsSection } from "./OverviewPipelineRunsSection";

vi.mock("@client/api", () => ({
  getPipelineStatus: vi.fn(),
  getPipelineRuns: vi.fn(),
  getPipelineRunInsights: vi.fn(),
}));

vi.mock("@client/components/PipelineProgress", () => ({
  PipelineProgress: ({ isRunning }: { isRunning: boolean }) =>
    isRunning ? <div data-testid="pipeline-progress">live progress</div> : null,
}));

import * as api from "@client/api";

describe("OverviewPipelineRunsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the last run summary and recent run statuses", async () => {
    vi.mocked(api.getPipelineStatus).mockResolvedValue({
      isRunning: false,
      lastRun: {
        id: "run-last",
        startedAt: "2026-04-18T10:00:00.000Z",
        completedAt: "2026-04-18T10:05:00.000Z",
        status: "completed",
        jobsDiscovered: 12,
        jobsProcessed: 3,
        errorMessage: null,
      },
      nextScheduledRun: null,
    });
    vi.mocked(api.getPipelineRuns).mockResolvedValue([
      {
        id: "run-last",
        startedAt: "2026-04-18T10:00:00.000Z",
        completedAt: "2026-04-18T10:05:00.000Z",
        status: "completed",
        jobsDiscovered: 12,
        jobsProcessed: 3,
        errorMessage: null,
      },
      {
        id: "run-failed",
        startedAt: "2026-04-17T10:00:00.000Z",
        completedAt: "2026-04-17T10:04:00.000Z",
        status: "failed",
        jobsDiscovered: 4,
        jobsProcessed: 0,
        errorMessage: "Scoring failed",
      },
      {
        id: "run-stale",
        startedAt: "2026-04-16T10:00:00.000Z",
        completedAt: null,
        status: "running",
        jobsDiscovered: 7,
        jobsProcessed: 0,
        errorMessage: null,
      },
    ]);
    vi.mocked(api.getPipelineRunInsights).mockResolvedValue({
      run: {
        id: "run-failed",
        startedAt: "2026-04-17T10:00:00.000Z",
        completedAt: "2026-04-17T10:04:00.000Z",
        status: "failed",
        jobsDiscovered: 4,
        jobsProcessed: 0,
        errorMessage: "Scoring failed",
      },
      exactMetrics: { durationMs: 240000 },
      inferredMetrics: {
        jobsCreated: { value: 4, quality: "inferred_from_timestamps" },
        jobsUpdated: { value: 4, quality: "inferred_from_timestamps" },
        jobsProcessed: { value: 0, quality: "inferred_from_timestamps" },
      },
    });

    renderWithQueryClient(<OverviewPipelineRunsSection />);

    expect(await screen.findByText("Pipeline runs")).toBeInTheDocument();
    expect(await screen.findByText("Current status")).toBeInTheDocument();
    expect(screen.getByText("Recent runs")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /17 Apr 2026/i }));

    await waitFor(() =>
      expect(api.getPipelineRunInsights).toHaveBeenCalledWith("run-failed"),
    );
    expect(await screen.findByText("Run details")).toBeInTheDocument();
    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(screen.getByText("Inferred from timestamps")).toBeInTheDocument();
    expect(screen.getByText("Scoring failed")).toBeInTheDocument();
  });

  it("shows live progress when a run is active", async () => {
    vi.mocked(api.getPipelineStatus).mockResolvedValue({
      isRunning: true,
      lastRun: {
        id: "run-active",
        startedAt: "2026-04-18T10:00:00.000Z",
        completedAt: null,
        status: "running",
        jobsDiscovered: 2,
        jobsProcessed: 0,
        errorMessage: null,
      },
      nextScheduledRun: null,
    });
    vi.mocked(api.getPipelineRuns).mockResolvedValue([
      {
        id: "run-active",
        startedAt: "2026-04-18T10:00:00.000Z",
        completedAt: null,
        status: "running",
        jobsDiscovered: 2,
        jobsProcessed: 0,
        errorMessage: null,
      },
    ]);
    vi.mocked(api.getPipelineRunInsights).mockResolvedValue({
      run: {
        id: "run-active",
        startedAt: "2026-04-18T10:00:00.000Z",
        completedAt: null,
        status: "running",
        jobsDiscovered: 2,
        jobsProcessed: 0,
        errorMessage: null,
      },
      exactMetrics: { durationMs: null },
      inferredMetrics: {
        jobsCreated: { value: null, quality: "unavailable" },
        jobsUpdated: { value: null, quality: "unavailable" },
        jobsProcessed: { value: null, quality: "unavailable" },
      },
    });

    renderWithQueryClient(<OverviewPipelineRunsSection />);

    expect(await screen.findByTestId("pipeline-progress")).toBeInTheDocument();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
  });
});

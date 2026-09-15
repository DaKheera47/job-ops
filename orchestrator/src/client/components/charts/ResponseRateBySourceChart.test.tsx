import {
  createJob as createBaseJob,
  createStageEvent,
} from "@shared/testing/factories.js";
import type { Job, StageEvent } from "@shared/types.js";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ResponseRateBySourceChart } from "./ResponseRateBySourceChart";

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card">{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-title">{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-description">{children}</div>
  ),
}));

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chart-container">{children}</div>
  ),
}));

vi.mock("recharts", () => ({
  BarChart: ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data?: unknown;
  }) => (
    <div data-testid="bar-chart">
      {children}
      <div data-testid="bar-chart-data">{JSON.stringify(data)}</div>
    </div>
  ),
  Bar: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="bar">{children}</div>
  ),
  Cell: () => <div data-testid="cell">Cell</div>,
  LabelList: () => <div data-testid="label-list">LabelList</div>,
  CartesianGrid: () => <div data-testid="cartesian-grid">Grid</div>,
  XAxis: () => <div data-testid="x-axis">XAxis</div>,
  YAxis: () => <div data-testid="y-axis">YAxis</div>,
  Tooltip: () => <div data-testid="tooltip">Tooltip</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

vi.mock("lucide-react", () => ({
  TrendingUp: () => <div data-testid="trending-up">TrendingUp</div>,
  TrendingDown: () => <div data-testid="trending-down">TrendingDown</div>,
}));

type ChartJob = Pick<Job, "id" | "source" | "appliedAt"> & {
  events: StageEvent[];
};

const createJob = (id: string, events: StageEvent[]): ChartJob => {
  const job = createBaseJob({
    id,
    source: "linkedin",
    appliedAt: "2025-01-10T00:00:00Z",
  });
  return { id: job.id, source: job.source, appliedAt: job.appliedAt, events };
};

const stageEvent = (
  applicationId: string,
  toStage: StageEvent["toStage"],
  occurredAt: number,
  overrides: Partial<StageEvent> = {},
): StageEvent =>
  createStageEvent({
    id: `${applicationId}-${toStage}-${occurredAt}`,
    applicationId,
    toStage,
    occurredAt,
    ...overrides,
  });

describe("ResponseRateBySourceChart", () => {
  it("counts an application as responded once it reaches a response stage", () => {
    const jobs = [
      createJob("job-1", [
        stageEvent("job-1", "applied", 1),
        stageEvent("job-1", "recruiter_screen", 2),
      ]),
      createJob("job-2", [stageEvent("job-2", "applied", 1)]),
    ];

    render(<ResponseRateBySourceChart jobs={jobs} error={null} />);

    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 applications/)).toBeInTheDocument();
  });

  it("does not count a response stage retracted by moving back to Applied", () => {
    const jobs = [
      createJob("job-1", [
        stageEvent("job-1", "applied", 1),
        stageEvent("job-1", "recruiter_screen", 2),
        stageEvent("job-1", "applied", 3, {
          fromStage: "recruiter_screen",
          metadata: { actor: "user", eventType: "status_update" },
        }),
      ]),
      createJob("job-2", [
        stageEvent("job-2", "applied", 1),
        stageEvent("job-2", "assessment", 2),
      ]),
    ];

    render(<ResponseRateBySourceChart jobs={jobs} error={null} />);

    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 applications/)).toBeInTheDocument();
  });
});

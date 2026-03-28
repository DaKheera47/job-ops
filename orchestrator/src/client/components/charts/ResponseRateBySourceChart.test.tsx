import {
  createJob as createBaseJob,
  createStageEvent,
} from "@shared/testing/factories.js";
import type { Job, JobSource, StageEvent } from "@shared/types.js";
import { fireEvent, render, screen } from "@testing-library/react";
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
    <div>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <div data-testid="chart-container" {...props}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({
    children,
    htmlFor,
    className,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
    className?: string;
  }) => (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    "aria-label": ariaLabel,
    ...props
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label"?: string;
  }) => (
    <button
      aria-label={ariaLabel ?? "Include small samples"}
      aria-pressed={checked}
      type="button"
      onClick={() => onCheckedChange(!checked)}
      {...props}
    />
  ),
}));

vi.mock("./ChartKpiPanel", () => ({
  ChartKpiPanel: ({
    label,
    rate,
    subtext,
  }: {
    label: string;
    rate: number;
    subtext: string;
  }) => (
    <div data-testid="chart-kpi-panel">
      <span>{label}</span>
      <span>{rate.toFixed(1)}%</span>
      <span>{subtext}</span>
    </div>
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
  Bar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => <div>Grid</div>,
  Cell: () => <div>Cell</div>,
  LabelList: () => <div>LabelList</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => <div>Tooltip</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
}));

const createJob = (
  id: string,
  source: JobSource,
  appliedAt: string | null,
  events: StageEvent[] = [],
) =>
  createBaseJob({
    id,
    source,
    datePosted: null,
    discoveredAt: "2025-01-01T00:00:00Z",
    appliedAt,
    ...({ events } as object),
  }) as Job & { events: StageEvent[] };

const createResponseEvent = (applicationId: string) =>
  createStageEvent({
    id: `event-${applicationId}`,
    applicationId,
    title: "Moved to recruiter screen",
    fromStage: "applied",
    toStage: "recruiter_screen",
    occurredAt: 1,
  });

describe("ResponseRateBySourceChart", () => {
  it("shows mobile-friendly source rows for visible samples", () => {
    const jobs = [
      createJob("manual-1", "manual", "2025-01-01T00:00:00Z", [
        createResponseEvent("manual-1"),
      ]),
      createJob("manual-2", "manual", "2025-01-01T00:00:00Z", [
        createResponseEvent("manual-2"),
      ]),
      createJob("manual-3", "manual", "2025-01-01T00:00:00Z", [
        createResponseEvent("manual-3"),
      ]),
      createJob("manual-4", "manual", "2025-01-01T00:00:00Z"),
      createJob("manual-5", "manual", "2025-01-01T00:00:00Z"),
      createJob("manual-6", "manual", "2025-01-01T00:00:00Z"),
      createJob("small-1", "linkedin", "2025-01-01T00:00:00Z"),
      createJob("small-2", "linkedin", "2025-01-01T00:00:00Z"),
    ];

    render(<ResponseRateBySourceChart jobs={jobs} error={null} />);

    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(
      screen.getByText("3 responded out of 6 applications"),
    ).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.queryByText("LinkedIn")).not.toBeInTheDocument();
    expect(screen.getByText(/n < 5 hidden/)).toBeInTheDocument();
  });

  it("includes small samples when the toggle is enabled", () => {
    const jobs = [
      createJob("manual-1", "manual", "2025-01-01T00:00:00Z", [
        createResponseEvent("manual-1"),
      ]),
      createJob("manual-2", "manual", "2025-01-01T00:00:00Z"),
      createJob("manual-3", "manual", "2025-01-01T00:00:00Z"),
      createJob("manual-4", "manual", "2025-01-01T00:00:00Z"),
      createJob("manual-5", "manual", "2025-01-01T00:00:00Z"),
      createJob("small-1", "linkedin", "2025-01-01T00:00:00Z"),
      createJob("small-2", "linkedin", "2025-01-01T00:00:00Z"),
    ];

    render(<ResponseRateBySourceChart jobs={jobs} error={null} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Include small samples" }),
    );

    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(
      screen.getByText("0 responded out of 2 applications"),
    ).toBeInTheDocument();
    expect(screen.getByText("All sources")).toBeInTheDocument();
    expect(screen.getByTestId("bar-chart-data")).toHaveTextContent(
      '"sourceLabel":"LinkedIn (2)"',
    );
  });
});

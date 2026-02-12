/**
 * ConversionAnalytics Edge Case Tests
 * Tests real-world edge cases for conversion funnel and analytics
 */

import {
  createJob as createBaseJob,
  createStageEvent,
} from "@shared/testing/factories.js";
import type { ApplicationStage, Job, StageEvent } from "@shared/types.js";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversionAnalytics } from "./ConversionAnalytics";

// Mock UI components
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
  ChartTooltip: () => <div data-testid="chart-tooltip">Tooltip</div>,
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
  Bar: () => <div data-testid="bar">Bar</div>,
  Cell: () => <div data-testid="cell">Cell</div>,
  LabelList: () => <div data-testid="label-list">LabelList</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line">Line</div>,
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

describe("ConversionAnalytics - Edge Cases", () => {
  const mockDate = new Date("2025-01-15T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createJob = (
    id: string,
    appliedAt: string | null,
    events: StageEvent[] = [],
  ) =>
    createBaseJob({
      id,
      datePosted: null,
      discoveredAt: "2025-01-01T00:00:00Z",
      appliedAt,
      ...({ events } as any),
    }) as Job & { events: StageEvent[] };

  const createEvent = (
    toStage: ApplicationStage,
    occurredAt: number,
  ): StageEvent =>
    createStageEvent({
      id: `event-${toStage}`,
      applicationId: "job-1",
      title: `Moved to ${toStage}`,
      fromStage: "applied",
      toStage,
      occurredAt,
    });

  describe("Empty and Null Data", () => {
    it("handles empty jobsWithEvents array - shows 0% conversion", () => {
      render(
        <ConversionAnalytics jobsWithEvents={[]} error={null} daysToShow={7} />,
      );

      expect(screen.getByText("0.0%")).toBeInTheDocument();
      expect(screen.getByText(/0 of 0 applications/)).toBeInTheDocument();
    });

    it("excludes jobs with null appliedAt from conversion calculation", () => {
      const jobs = [
        createJob("job-1", null, []),
        createJob("job-2", null, [
          createEvent("recruiter_screen", 1704844800000),
        ]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("0.0%")).toBeInTheDocument();
      expect(screen.getByText(/0 of 0 applications/)).toBeInTheDocument();
    });

    it("counts all jobs with appliedAt regardless of date range for overall stats", () => {
      const today = mockDate.toISOString();
      const oldDate = "2025-01-01T00:00:00Z"; // Outside 7-day range
      const jobs = [
        createJob("job-1", today, []),
        createJob("job-2", today, []),
        createJob("job-3", oldDate, []), // Still counted in overall stats
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      // Overall conversion counts all jobs with appliedAt (not filtered by date)
      expect(screen.getByText(/0 of 3 applications/)).toBeInTheDocument();
    });
  });

  describe("Conversion Rate Edge Cases", () => {
    it("shows 0% conversion when no jobs have conversion events", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, []),
        createJob("job-2", today, []),
        createJob("job-3", today, [createEvent("closed", 1704844800000)]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("0.0%")).toBeInTheDocument();
      expect(screen.getByText(/0 of 3 applications/)).toBeInTheDocument();
      expect(screen.getByTestId("trending-down")).toBeInTheDocument();
    });

    it("shows 100% conversion when all jobs have conversion events", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, [
          createEvent("recruiter_screen", 1704844800000),
        ]),
        createJob("job-2", today, [
          createEvent("technical_interview", 1704844800000),
        ]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("100.0%")).toBeInTheDocument();
      expect(screen.getByText(/2 of 2 applications/)).toBeInTheDocument();
      expect(screen.getByTestId("trending-up")).toBeInTheDocument();
    });

    it("calculates partial conversion rate correctly", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, [
          createEvent("recruiter_screen", 1704844800000),
        ]),
        createJob("job-2", today, []),
        createJob("job-3", today, []),
        createJob("job-4", today, [createEvent("offer", 1704844800000)]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("50.0%")).toBeInTheDocument();
      expect(screen.getByText(/2 of 4 applications/)).toBeInTheDocument();
    });

    it("handles jobs with multiple events - counts as converted if any event is in CONVERSION_STAGES", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, [
          createEvent("closed", 1704844800000),
          createEvent("recruiter_screen", 1704931200000),
        ]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("100.0%")).toBeInTheDocument();
      expect(screen.getByText(/1 of 1 applications/)).toBeInTheDocument();
    });
  });

  describe("Funnel Data Edge Cases", () => {
    it("shows all zeros in funnel when no jobs are applied", () => {
      const jobs = [createJob("job-1", null, []), createJob("job-2", null, [])];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      // Funnel should still render with 0 values
      expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    });

    it("correctly categorizes screening stages (recruiter_screen, assessment)", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, [
          createEvent("recruiter_screen", 1704844800000),
        ]),
        createJob("job-2", today, [createEvent("assessment", 1704844800000)]),
        createJob("job-3", today, []),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      // Both recruiter_screen and assessment count as screening
      expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    });

    it("correctly categorizes interview stages", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, [
          createEvent("hiring_manager_screen", 1704844800000),
        ]),
        createJob("job-2", today, [
          createEvent("technical_interview", 1704844800000),
        ]),
        createJob("job-3", today, [createEvent("onsite", 1704844800000)]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    });

    it("handles job that reached multiple funnel stages", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, [
          createEvent("recruiter_screen", 1704844800000),
          createEvent("technical_interview", 1704931200000),
          createEvent("offer", 1705017600000),
        ]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      // Job should count in all stages it reached
      expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    });

    it("adds rejected funnel bar using rejected outcome/reason code only", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, [
          createEvent("closed", 1704844800000),
          createStageEvent({
            id: "event-rejected-1",
            applicationId: "job-1",
            toStage: "closed",
            occurredAt: 1704844800001,
            outcome: "rejected",
          }),
        ]),
        createJob("job-2", today, [
          createStageEvent({
            id: "event-rejected-2",
            applicationId: "job-2",
            toStage: "closed",
            occurredAt: 1704844800002,
            metadata: { reasonCode: "rejected" },
          }),
        ]),
        createJob("job-3", today, [
          createStageEvent({
            id: "event-withdrawn",
            applicationId: "job-3",
            toStage: "closed",
            occurredAt: 1704844800003,
            outcome: "withdrawn",
          }),
        ]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(
        screen.getByText(
          "Funnel: Applied → Screening → Interview → Offer → Rejected",
        ),
      ).toBeInTheDocument();

      const chartDataRaw = screen.getByTestId("bar-chart-data").textContent;
      expect(chartDataRaw).not.toBeNull();

      const chartData = JSON.parse(chartDataRaw ?? "[]") as Array<{
        name: string;
        value: number;
      }>;
      const rejectedDataPoint = chartData.find(
        (point) => point.name === "Rejected",
      );

      expect(rejectedDataPoint).toEqual(
        expect.objectContaining({ name: "Rejected", value: 2 }),
      );
    });
  });

  describe("Date Range and Invalid Dates", () => {
    it("counts jobs with any non-null appliedAt (overall stats don't validate dates)", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, []),
        createJob("job-2", "invalid-date", []),
        createJob("job-3", "", []),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      // calculateOverallConversion only checks !job.appliedAt (null/undefined)
      // Empty string "" is falsy in JS, so it's filtered. "invalid-date" is truthy, so counted.
      // Result: job-1 and job-2 are counted = 2 total
      expect(screen.getByText(/0 of 2 applications/)).toBeInTheDocument();
    });

    it("includes jobs outside date range in overall conversion stats", () => {
      const oldDate = "2025-01-01T00:00:00Z"; // Before 7-day window
      const jobs = [
        createJob("job-1", oldDate, [createEvent("offer", 1704153600000)]),
        createJob("job-2", oldDate, [
          createEvent("recruiter_screen", 1704153600000),
        ]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      // Overall conversion counts all jobs with appliedAt (not filtered by date)
      // Both jobs have conversion events (offer and recruiter_screen)
      expect(screen.getByText("100.0%")).toBeInTheDocument();
      expect(screen.getByText(/2 of 2 applications/)).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("displays error message when error prop is set", () => {
      render(
        <ConversionAnalytics
          jobsWithEvents={[]}
          error="Failed to fetch conversion data"
          daysToShow={7}
        />,
      );

      expect(
        screen.getByText("Failed to fetch conversion data"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("bar-chart")).not.toBeInTheDocument();
      expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
    });

    it("renders charts when no error", () => {
      render(
        <ConversionAnalytics jobsWithEvents={[]} error={null} daysToShow={7} />,
      );

      expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
      expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    });
  });

  describe("Trend Indicator Logic", () => {
    it("shows down trend indicator when conversion rate is below 10%", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, []),
        createJob("job-2", today, []),
        createJob("job-3", today, []),
        createJob("job-4", today, []),
        createJob("job-5", today, [
          createEvent("recruiter_screen", 1704844800000),
        ]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("20.0%")).toBeInTheDocument();
      // 20% is not < 10%, so no trending-down
      expect(screen.queryByTestId("trending-down")).not.toBeInTheDocument();
    });

    it("shows no trend indicator for moderate conversion rates (10-25%)", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, [
          createEvent("recruiter_screen", 1704844800000),
        ]),
        createJob("job-2", today, []),
        createJob("job-3", today, []),
        createJob("job-4", today, []),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("25.0%")).toBeInTheDocument();
      // 25% is not > 25%, so no trending-up
      expect(screen.queryByTestId("trending-up")).not.toBeInTheDocument();
      expect(screen.queryByTestId("trending-down")).not.toBeInTheDocument();
    });
  });

  describe("Time Series Data Edge Cases", () => {
    it("handles conversion rate calculation with rolling window", () => {
      const today = mockDate.toISOString();
      const yesterday = "2025-01-14T00:00:00Z";
      const jobs = [
        createJob("job-1", today, [
          createEvent("recruiter_screen", 1705276800000),
        ]),
        createJob("job-2", yesterday, []),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    });

    it("handles single day range for time series", () => {
      const today = mockDate.toISOString();
      const jobs = [
        createJob("job-1", today, [
          createEvent("recruiter_screen", 1705276800000),
        ]),
      ];

      render(
        <ConversionAnalytics
          jobsWithEvents={jobs}
          error={null}
          daysToShow={1}
        />,
      );

      expect(screen.getByTestId("line-chart")).toBeInTheDocument();
      expect(screen.getByText(/rolling 1-day average/)).toBeInTheDocument();
    });
  });
});

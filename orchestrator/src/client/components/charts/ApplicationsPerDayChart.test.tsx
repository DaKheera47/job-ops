/**
 * ApplicationsPerDayChart Edge Case Tests
 * Tests real-world edge cases and data transformation logic
 */

import { render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationsPerDayChart } from "./ApplicationsPerDayChart";

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
  ChartTooltipContent: () => (
    <div data-testid="chart-tooltip-content">TooltipContent</div>
  ),
}));

vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar">Bar</div>,
  CartesianGrid: () => <div data-testid="cartesian-grid">Grid</div>,
  XAxis: () => <div data-testid="x-axis">XAxis</div>,
}));

vi.mock("lucide-react", () => ({
  TrendingUp: () => <div data-testid="trending-up">TrendingUp</div>,
  TrendingDown: () => <div data-testid="trending-down">TrendingDown</div>,
}));

describe("ApplicationsPerDayChart - Edge Cases", () => {
  const mockDate = new Date("2025-01-15T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Empty and Null Data", () => {
    it("handles empty appliedAt array - shows zero total and average", () => {
      render(
        <ApplicationsPerDayChart
          appliedAt={[]}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("0.0")).toBeInTheDocument();
      expect(screen.getByText(/Last 7 days · 0 total/)).toBeInTheDocument();
    });

    it("handles appliedAt with all null values - filters out nulls correctly", () => {
      render(
        <ApplicationsPerDayChart
          appliedAt={[null, null, null]}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("0.0")).toBeInTheDocument();
      expect(screen.getByText(/Last 7 days · 0 total/)).toBeInTheDocument();
    });

    it("handles mixed null and valid dates - counts only valid dates", () => {
      const today = mockDate.toISOString();
      render(
        <ApplicationsPerDayChart
          appliedAt={[null, today, null, today, today]}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText(/Last 7 days · 3 total/)).toBeInTheDocument();
    });
  });

  describe("Invalid Date Handling", () => {
    it("filters out invalid date strings", () => {
      const today = mockDate.toISOString();
      render(
        <ApplicationsPerDayChart
          appliedAt={["invalid-date", today, "", "not-a-date", today]}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText(/Last 7 days · 2 total/)).toBeInTheDocument();
    });

    it("handles malformed ISO dates gracefully", () => {
      const today = mockDate.toISOString();
      render(
        <ApplicationsPerDayChart
          appliedAt={["2025-13-45", today, "2025-01-00", today]}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText(/Last 7 days · 2 total/)).toBeInTheDocument();
    });
  });

  describe("Date Range Filtering", () => {
    it("filters out dates before the start of range", () => {
      const today = mockDate.toISOString();
      const oldDate = "2025-01-01T00:00:00Z"; // Before 7-day window
      render(
        <ApplicationsPerDayChart
          appliedAt={[oldDate, today, today]}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText(/Last 7 days · 2 total/)).toBeInTheDocument();
    });

    it("filters out dates after the end of range (future dates)", () => {
      const today = mockDate.toISOString();
      const futureDate = "2025-01-20T00:00:00Z"; // After today
      render(
        <ApplicationsPerDayChart
          appliedAt={[today, futureDate, today]}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText(/Last 7 days · 2 total/)).toBeInTheDocument();
    });

    it("handles single day range (daysToShow=1)", () => {
      const today = mockDate.toISOString();
      const yesterday = "2025-01-14T00:00:00Z";
      render(
        <ApplicationsPerDayChart
          appliedAt={[today, yesterday, today]}
          isLoading={false}
          error={null}
          daysToShow={1}
        />,
      );

      expect(screen.getByText(/Last 1 days · 2 total/)).toBeInTheDocument();
    });
  });

  describe("Trend Calculation Edge Cases", () => {
    it("shows neutral trend when first half average is 0 and second half is also 0", () => {
      // All zeros - no trend indicator should show
      render(
        <ApplicationsPerDayChart
          appliedAt={[]}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.queryByTestId("trending-up")).not.toBeInTheDocument();
      expect(screen.queryByTestId("trending-down")).not.toBeInTheDocument();
    });

    it("shows up trend when first half is 0 but second half has activity", () => {
      const dates = [
        "2025-01-15T00:00:00Z", // Today (second half)
        "2025-01-15T00:00:00Z",
        "2025-01-15T00:00:00Z",
      ];
      render(
        <ApplicationsPerDayChart
          appliedAt={dates}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByTestId("trending-up")).toBeInTheDocument();
    });

    it("calculates trend percentage correctly for positive trend", () => {
      // First half: 1 app per day avg, Second half: 3 apps per day avg = 200% increase
      const dates = [
        "2025-01-09T00:00:00Z", // First half
        "2025-01-15T00:00:00Z", // Second half
        "2025-01-15T00:00:00Z",
        "2025-01-15T00:00:00Z",
      ];
      render(
        <ApplicationsPerDayChart
          appliedAt={dates}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByTestId("trending-up")).toBeInTheDocument();
    });

    it("shows down trend for significant negative trend", () => {
      // First half: high activity, Second half: low activity
      const dates = [
        "2025-01-09T00:00:00Z", // First half - 3 apps
        "2025-01-09T00:00:00Z",
        "2025-01-09T00:00:00Z",
        "2025-01-15T00:00:00Z", // Second half - 1 app
      ];
      render(
        <ApplicationsPerDayChart
          appliedAt={dates}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByTestId("trending-down")).toBeInTheDocument();
    });
  });

  describe("Loading and Error States", () => {
    it("shows loading state description", () => {
      render(
        <ApplicationsPerDayChart
          appliedAt={[]}
          isLoading={true}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText("Loading applied jobs...")).toBeInTheDocument();
    });

    it("displays error message when error prop is set", () => {
      render(
        <ApplicationsPerDayChart
          appliedAt={[]}
          isLoading={false}
          error="Failed to load application data"
          daysToShow={7}
        />,
      );

      expect(
        screen.getByText("Failed to load application data"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("chart-container")).not.toBeInTheDocument();
    });

    it("renders chart when no error", () => {
      render(
        <ApplicationsPerDayChart
          appliedAt={[]}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByTestId("chart-container")).toBeInTheDocument();
    });
  });

  describe("Large Data Stress Tests", () => {
    it("handles large number of applications efficiently", () => {
      const today = mockDate.toISOString();
      const largeData = Array(1000).fill(today);

      render(
        <ApplicationsPerDayChart
          appliedAt={largeData}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText(/Last 7 days · 1,000 total/)).toBeInTheDocument();
      expect(screen.getByText("142.9")).toBeInTheDocument(); // 1000/7
    });

    it("handles applications spread across different days in range", () => {
      const dates = [
        "2025-01-09T00:00:00Z",
        "2025-01-10T00:00:00Z",
        "2025-01-10T00:00:00Z",
        "2025-01-11T00:00:00Z",
        "2025-01-11T00:00:00Z",
        "2025-01-11T00:00:00Z",
        "2025-01-15T00:00:00Z",
      ];
      render(
        <ApplicationsPerDayChart
          appliedAt={dates}
          isLoading={false}
          error={null}
          daysToShow={7}
        />,
      );

      expect(screen.getByText(/Last 7 days · 7 total/)).toBeInTheDocument();
      expect(screen.getByText("1.0")).toBeInTheDocument(); // 7/7
    });
  });
});

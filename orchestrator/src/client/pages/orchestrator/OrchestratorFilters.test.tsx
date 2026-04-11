import type { JobSource } from "@shared/types.js";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FilterTab, JobSort, SponsorFilter } from "./constants";
import { OrchestratorFilters } from "./OrchestratorFilters";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: originalScrollIntoView,
  });
});

const renderFilters = (
  overrides?: Partial<ComponentProps<typeof OrchestratorFilters>>,
) => {
  const props = {
    activeTab: "ready" as FilterTab,
    onTabChange: vi.fn(),
    counts: {
      ready: 2,
      discovered: 1,
      applied: 3,
      all: 6,
    },
    onOpenCommandBar: vi.fn(),
    sourceFilter: "all" as const,
    onSourceFilterChange: vi.fn(),
    sponsorFilter: "all" as SponsorFilter,
    onSponsorFilterChange: vi.fn(),
    salaryFilter: {
      mode: "at_least" as const,
      min: null,
      max: null,
    },
    onSalaryFilterChange: vi.fn(),
    dateFilter: {
      dimensions: [],
      startDate: null,
      endDate: null,
      preset: null,
    },
    onDateFilterChange: vi.fn(),
    sourcesWithJobs: ["gradcracker", "linkedin", "manual"] as JobSource[],
    sort: { key: "score", direction: "desc" } as JobSort,
    onSortChange: vi.fn(),
    onResetFilters: vi.fn(),
    filteredCount: 5,
    ...overrides,
  };

  return {
    props,
    ...render(<OrchestratorFilters {...props} />),
  };
};

describe("OrchestratorFilters", () => {
  it("notifies when tabs and command search shortcut are used", () => {
    const { props } = renderFilters();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /applied/i }));
    expect(props.onTabChange).toHaveBeenCalledWith("applied");

    fireEvent.click(screen.getByRole("button", { name: /search jobs/i }));
    expect(props.onOpenCommandBar).toHaveBeenCalled();
  });

  it("updates source, sponsor, salary range, and sort from the drawer", async () => {
    const { props } = renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /^filters/i }));

    fireEvent.click(await screen.findByRole("button", { name: /linkedin/i }));
    expect(props.onSourceFilterChange).toHaveBeenCalledWith("linkedin");

    fireEvent.click(screen.getByRole("button", { name: "Potential sponsor" }));
    expect(props.onSponsorFilterChange).toHaveBeenCalledWith("potential");

    fireEvent.change(screen.getByLabelText("Minimum"), {
      target: { value: "65000" },
    });
    expect(props.onSalaryFilterChange).toHaveBeenCalledWith({
      mode: "at_least",
      min: 65000,
      max: null,
    });

    fireEvent.click(
      screen.getByRole("combobox", { name: "Salary range specifier" }),
    );
    fireEvent.click(await screen.findByText("between"));
    expect(props.onSalaryFilterChange).toHaveBeenCalledWith({
      mode: "between",
      min: null,
      max: null,
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Sort field" }));
    fireEvent.click(await screen.findByText("Date"));
    expect(props.onSortChange).toHaveBeenCalledWith({
      key: "date",
      direction: "desc",
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Sort order" }));
    fireEvent.click(await screen.findByText("Smallest first"));
    expect(props.onSortChange).toHaveBeenCalledWith({
      key: "score",
      direction: "asc",
    });
  });

  it("updates date presets and custom dates from the drawer", async () => {
    const { props } = renderFilters({
      dateFilter: {
        dimensions: ["applied"],
        startDate: "2026-04-01",
        endDate: "2026-04-08",
        preset: "custom",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^filters/i }));

    fireEvent.click(screen.getByRole("button", { name: "Ready" }));
    expect(props.onDateFilterChange).toHaveBeenCalledWith({
      dimensions: ["ready", "applied"],
      startDate: "2026-04-01",
      endDate: "2026-04-08",
      preset: "custom",
    });

    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    expect(props.onDateFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dimensions: ["applied"],
        preset: "7",
      }),
    );

    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-04-02" },
    });
    expect(props.onDateFilterChange).toHaveBeenCalledWith({
      dimensions: ["applied"],
      startDate: "2026-04-02",
      endDate: "2026-04-08",
      preset: "custom",
    });

    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-04-09" },
    });
    expect(props.onDateFilterChange).toHaveBeenCalledWith({
      dimensions: ["applied"],
      startDate: "2026-04-01",
      endDate: "2026-04-09",
      preset: "custom",
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear date filters" }));
    expect(props.onDateFilterChange).toHaveBeenCalledWith({
      dimensions: [],
      startDate: null,
      endDate: null,
      preset: null,
    });
  });

  it("resets filters and only shows sources present in jobs", async () => {
    const { props } = renderFilters({
      sourcesWithJobs: ["gradcracker", "manual"],
    });

    fireEvent.click(screen.getByRole("button", { name: /^filters/i }));

    expect(
      screen.queryByRole("button", { name: "LinkedIn" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Gradcracker" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manual" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(props.onResetFilters).toHaveBeenCalled();
  });
});

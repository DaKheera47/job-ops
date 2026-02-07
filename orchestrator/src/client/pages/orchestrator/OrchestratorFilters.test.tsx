import type { JobSource } from "@shared/types.js";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FilterTab, JobSort, SponsorFilter } from "./constants";
import { OrchestratorFilters } from "./OrchestratorFilters";

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
    searchQuery: "",
    onSearchQueryChange: vi.fn(),
    sourceFilter: "all" as const,
    onSourceFilterChange: vi.fn(),
    sponsorFilter: "all" as SponsorFilter,
    onSponsorFilterChange: vi.fn(),
    minSalary: null,
    onMinSalaryChange: vi.fn(),
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
  it("notifies when tabs and search are updated", () => {
    const { props } = renderFilters();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /applied/i }));
    expect(props.onTabChange).toHaveBeenCalledWith("applied");

    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "Design" },
    });
    expect(props.onSearchQueryChange).toHaveBeenCalledWith("Design");
  });

  it("updates source, sponsor, min salary, and sort from the drawer", () => {
    const { props } = renderFilters();

    fireEvent.click(screen.getByRole("button", { name: /^filters/i }));

    fireEvent.click(screen.getByRole("button", { name: "LinkedIn" }));
    expect(props.onSourceFilterChange).toHaveBeenCalledWith("linkedin");

    fireEvent.click(screen.getByRole("button", { name: "Potential sponsor" }));
    expect(props.onSponsorFilterChange).toHaveBeenCalledWith("potential");

    fireEvent.change(screen.getByLabelText("Minimum salary"), {
      target: { value: "65000" },
    });
    expect(props.onMinSalaryChange).toHaveBeenCalledWith(65000);

    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(props.onSortChange).toHaveBeenCalledWith({
      key: "title",
      direction: "asc",
    });
  });

  it("resets filters and only shows sources present in jobs", () => {
    const { props } = renderFilters({ sourcesWithJobs: ["gradcracker", "manual"] });

    fireEvent.click(screen.getByRole("button", { name: /^filters/i }));

    expect(
      screen.queryByRole("button", { name: "LinkedIn" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gradcracker" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manual" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(props.onResetFilters).toHaveBeenCalled();
  });
});

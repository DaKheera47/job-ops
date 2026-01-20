import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { ComponentProps } from "react";

import { OrchestratorFilters } from "./OrchestratorFilters";
import type { FilterTab, JobSort } from "./constants";

vi.mock("@/components/ui/dropdown-menu", () => {
  const React = require("react") as typeof import("react");
  const RadioGroupContext = React.createContext<((value: string) => void) | null>(null);

  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
    }) => (
      <button type="button" role="menuitem" onClick={() => onSelect?.()} {...props}>
        {children}
      </button>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <div role="separator" />,
    DropdownMenuRadioGroup: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <RadioGroupContext.Provider value={onValueChange ?? null}>
        <div role="radiogroup">{children}</div>
      </RadioGroupContext.Provider>
    ),
    DropdownMenuRadioItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const onValueChange = React.useContext(RadioGroupContext);
      return (
        <button type="button" role="menuitemradio" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

const renderFilters = (overrides?: Partial<ComponentProps<typeof OrchestratorFilters>>) => {
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
    sort: { key: "score", direction: "desc" } as JobSort,
    onSortChange: vi.fn(),
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

    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "Design" } });
    expect(props.onSearchQueryChange).toHaveBeenCalledWith("Design");
  });

  it("updates source and sort selections", async () => {
    const { props } = renderFilters();

    fireEvent.pointerDown(screen.getByRole("button", { name: /all sources/i }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /LinkedIn/i }));
    expect(props.onSourceFilterChange).toHaveBeenCalledWith("linkedin");

    fireEvent.pointerDown(screen.getByRole("button", { name: /score/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Direction:/i }));
    expect(props.onSortChange).toHaveBeenCalledWith({ key: "score", direction: "asc" });
  });
});

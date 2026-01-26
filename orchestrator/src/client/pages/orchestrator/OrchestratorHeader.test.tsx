import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { OrchestratorHeader } from "./OrchestratorHeader";

vi.mock("@/components/ui/dropdown-menu", () => {
  const React = require("react") as typeof import("react");

  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuItem: ({
      children,
      onSelect,
    }: {
      children: React.ReactNode;
      onSelect?: (event: Event) => void;
    }) => (
      <button
        type="button"
        role="menuitem"
        onClick={() =>
          onSelect?.({ preventDefault: () => {} } as unknown as Event)
        }
      >
        {children}
      </button>
    ),
    DropdownMenuCheckboxItem: ({
      children,
      onCheckedChange,
      checked,
    }: {
      children: React.ReactNode;
      onCheckedChange?: (checked: boolean) => void;
      checked?: boolean;
    }) => (
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={checked}
        onClick={() => onCheckedChange?.(!checked)}
      >
        {children}
      </button>
    ),
  };
});

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const renderHeader = (
  overrides: Partial<React.ComponentProps<typeof OrchestratorHeader>> = {},
) => {
  const props: React.ComponentProps<typeof OrchestratorHeader> = {
    navOpen: false,
    onNavOpenChange: vi.fn(),
    isPipelineRunning: false,
    pipelineSources: ["gradcracker"],
    enabledSources: ["gradcracker"],
    onToggleSource: vi.fn(),
    onSetPipelineSources: vi.fn(),
    onRunPipeline: vi.fn(),
    onOpenManualImport: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...render(
      <MemoryRouter>
        <OrchestratorHeader {...props} />
      </MemoryRouter>,
    ),
  };
};

describe("OrchestratorHeader", () => {
  it("renders only enabled sources", () => {
    renderHeader({
      enabledSources: ["gradcracker", "linkedin"],
      pipelineSources: ["linkedin"],
    });

    expect(
      screen.getByRole("menuitemcheckbox", { name: /Gradcracker/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /LinkedIn/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /UK Visa Jobs/i }),
    ).not.toBeInTheDocument();
  });

  it("uses enabled sources for the all sources action", () => {
    const { props } = renderHeader({
      enabledSources: ["gradcracker", "linkedin"],
    });

    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: /Select all sources/i }),
    );

    expect(props.onSetPipelineSources).toHaveBeenCalledWith([
      "gradcracker",
      "linkedin",
    ]);
  });

  it("does not show source presets", () => {
    renderHeader({ enabledSources: ["gradcracker", "linkedin"] });

    expect(
      screen.queryByRole("menuitem", { name: /Gradcracker only/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Indeed \+ LinkedIn only/i }),
    ).not.toBeInTheDocument();
  });
});

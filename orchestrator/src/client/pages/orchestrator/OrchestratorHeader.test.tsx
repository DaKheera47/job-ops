import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { OrchestratorHeader } from "./OrchestratorHeader";

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
    isCancelling: false,
    pipelineSources: ["gradcracker"],
    onOpenAutomaticRun: vi.fn(),
    onCancelPipeline: vi.fn(),
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
  it("opens search setup from Find jobs", () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /find jobs/i }));
    expect(props.onOpenAutomaticRun).toHaveBeenCalled();
  });

  it("uses the navbar button as the search composer close toggle", () => {
    const { props } = renderHeader({ isSearchComposerOpen: true });
    const button = screen.getByRole("button", { name: /close search/i });

    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);

    expect(props.onOpenAutomaticRun).toHaveBeenCalled();
  });

  it("opens import directly from Add a job", () => {
    const { props } = renderHeader();

    fireEvent.click(screen.getByRole("button", { name: /add a job/i }));

    expect(props.onOpenManualImport).toHaveBeenCalled();
  });

  it("hides the run action while keeping manual import reachable", () => {
    renderHeader({ hideRunAction: true });
    expect(
      screen.queryByRole("button", { name: /find jobs/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add a job/i }),
    ).toBeInTheDocument();
  });

  it("renders cancel button while running and triggers cancel", () => {
    const { props } = renderHeader({ isPipelineRunning: true });
    fireEvent.click(screen.getByRole("button", { name: /cancel run/i }));
    expect(props.onCancelPipeline).toHaveBeenCalled();
  });
});

import type { AppSettings } from "@shared/types";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { AutomaticRunTab } from "./AutomaticRunTab";

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

describe("AutomaticRunTab", () => {
  it("loads persisted country from settings", () => {
    render(
      <AutomaticRunTab
        open
        settings={
          {
            searchTerms: ["backend engineer"],
            jobspyCountryIndeed: "us",
          } as AppSettings
        }
        enabledSources={["linkedin", "gradcracker", "ukvisajobs"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "United States" }),
    ).toBeInTheDocument();
  });

  it("disables and prunes UK-only sources for non-UK country", async () => {
    const onSetPipelineSources = vi.fn();

    render(
      <AutomaticRunTab
        open
        settings={
          {
            searchTerms: ["backend engineer"],
            jobspyCountryIndeed: "united states",
          } as AppSettings
        }
        enabledSources={["linkedin", "gradcracker", "ukvisajobs"]}
        pipelineSources={["linkedin", "gradcracker", "ukvisajobs"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={onSetPipelineSources}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(onSetPipelineSources).toHaveBeenCalledWith(["linkedin"]);
    });

    expect(screen.getByRole("button", { name: "Gradcracker" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "UK Visa Jobs" })).toBeDisabled();
  });

  it("shows disabled source guidance copy for UK-only source", () => {
    render(
      <AutomaticRunTab
        open
        settings={
          {
            searchTerms: ["backend engineer"],
            jobspyCountryIndeed: "united states",
          } as AppSettings
        }
        enabledSources={["linkedin", "gradcracker", "ukvisajobs"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByTitle(
        "Gradcracker is available only when country is United Kingdom.",
      ),
    ).toBeInTheDocument();
  });
});

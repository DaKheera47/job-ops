import { createAppSettings } from "@shared/testing/factories.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        settings={createAppSettings({
          searchTerms: ["backend engineer"],
          jobspyCountryIndeed: "us",
          searchCities: "",
        })}
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

  it("maps legacy usa/ca country to United States in the picker", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: ["backend engineer"],
          jobspyCountryIndeed: "usa/ca",
          searchCities: "",
        })}
        enabledSources={["linkedin"]}
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
        settings={createAppSettings({
          searchTerms: ["backend engineer"],
          jobspyCountryIndeed: "united states",
          searchCities: "",
        })}
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

  it("shows disabled source guidance copy for UK-only source", async () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: ["backend engineer"],
          jobspyCountryIndeed: "united states",
          searchCities: "",
        })}
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

  it("disables glassdoor for unsupported countries with guidance copy", async () => {
    const onSetPipelineSources = vi.fn();

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: ["backend engineer"],
          jobspyCountryIndeed: "japan",
          searchCities: "",
        })}
        enabledSources={["linkedin", "glassdoor"]}
        pipelineSources={["linkedin", "glassdoor"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={onSetPipelineSources}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(onSetPipelineSources).toHaveBeenCalledWith(["linkedin"]);
    });

    const glassdoorButton = screen.getByRole("button", { name: "Glassdoor" });
    expect(glassdoorButton).toBeDisabled();
    expect(glassdoorButton.getAttribute("title")).toContain(
      "Glassdoor is not available for the selected country.",
    );
  });

  it("disables glassdoor for supported countries until city is provided", async () => {
    const onSetPipelineSources = vi.fn();

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: ["backend engineer"],
          jobspyCountryIndeed: "united kingdom",
          searchCities: "United Kingdom",
        })}
        enabledSources={["linkedin", "glassdoor"]}
        pipelineSources={["linkedin", "glassdoor"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={onSetPipelineSources}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(onSetPipelineSources).toHaveBeenCalledWith(["linkedin"]);
    });

    const glassdoorButton = screen.getByRole("button", { name: "Glassdoor" });
    expect(glassdoorButton).toBeDisabled();
    expect(glassdoorButton.getAttribute("title")).toContain(
      "Add at least one city in Advanced settings to enable Glassdoor.",
    );
  });

  it("does not remove existing search terms when Backspace is pressed on an empty input", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: ["backend engineer", "frontend engineer"],
          jobspyCountryIndeed: "united kingdom",
          searchCities: "",
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const input = screen.getByPlaceholderText("Type and press Enter");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(
      screen.getByRole("button", { name: "Remove backend engineer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove frontend engineer" }),
    ).toBeInTheDocument();
  });

  it("loads multiple saved cities and keeps glassdoor enabled", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: ["backend engineer"],
          jobspyCountryIndeed: "united kingdom",
          searchCities: "London|Manchester",
        })}
        enabledSources={["linkedin", "glassdoor"]}
        pipelineSources={["linkedin", "glassdoor"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    fireEvent.focus(screen.getByLabelText("Cities"));

    expect(
      screen.getByRole("button", { name: "Remove city London" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove city Manchester" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Glassdoor" })).toBeEnabled();
  });
});

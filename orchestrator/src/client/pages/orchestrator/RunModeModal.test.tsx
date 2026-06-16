import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunModeModal } from "./RunModeModal";

vi.mock("@client/components/ManualImportFlow", () => ({
  ManualImportFlow: () => <div data-testid="manual-flow">Manual flow</div>,
}));

vi.mock("./AutomaticRunTab", () => ({
  AutomaticRunTab: () => (
    <div data-testid="automatic-tab">Automatic run tab</div>
  ),
}));

describe("RunModeModal", () => {
  it("switches between Automatic and Manual tabs", () => {
    render(
      <RunModeModal
        open
        mode="automatic"
        settings={null}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onOpenChange={vi.fn()}
        onModeChange={vi.fn()}
        onSaveAndRunAutomatic={vi.fn().mockResolvedValue(undefined)}
        onManualImported={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByTestId("automatic-tab")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /manual/i })).toBeInTheDocument();
  });

  it("can hide mode tabs for the full-page composer", () => {
    render(
      <RunModeModal
        open
        mode="automatic"
        showModeTabs={false}
        settings={null}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onOpenChange={vi.fn()}
        onModeChange={vi.fn()}
        onSaveAndRunAutomatic={vi.fn().mockResolvedValue(undefined)}
        onManualImported={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByTestId("automatic-tab")).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /automatic/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /manual/i }),
    ).not.toBeInTheDocument();
  });

  it("uses the review header for manual import", () => {
    render(
      <RunModeModal
        open
        mode="manual"
        settings={null}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onOpenChange={vi.fn()}
        onModeChange={vi.fn()}
        onSaveAndRunAutomatic={vi.fn().mockResolvedValue(undefined)}
        onManualImported={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /review job details/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/describe a job search or import jobs manually/i),
    ).not.toBeInTheDocument();
  });
});

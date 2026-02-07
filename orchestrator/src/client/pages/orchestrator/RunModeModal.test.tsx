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
});

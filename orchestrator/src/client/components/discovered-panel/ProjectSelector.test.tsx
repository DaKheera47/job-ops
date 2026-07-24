import { resolveResumeProjectSelection } from "@shared/resume-projects";
import { createResumeProjectCatalogItem } from "@shared/testing/factories.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSelector } from "./ProjectSelector";

describe("ProjectSelector", () => {
  it("renders html project descriptions as plain text", () => {
    const catalog = [
      createResumeProjectCatalogItem({
        id: "project",
        description:
          "<ul><li><p><strong>Built analytics</strong> using FastAPI.</p></li></ul>",
      }),
    ];
    render(
      <ProjectSelector
        catalog={catalog}
        resolution={resolveResumeProjectSelection({
          catalog,
          resumeProjects: {
            maxProjects: 3,
            lockedProjectIds: [],
            aiSelectableProjectIds: ["project"],
          },
        })}
        onToggle={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByText("Built analytics using FastAPI.")).toBeVisible();
    expect(screen.queryByText(/<strong>/)).not.toBeInTheDocument();
  });

  it("shows must-include projects as selected and hides excluded projects", () => {
    const catalog = ["a", "b", "c", "excluded"].map((id) =>
      createResumeProjectCatalogItem({ id, name: id }),
    );
    render(
      <ProjectSelector
        catalog={catalog}
        resolution={resolveResumeProjectSelection({
          catalog,
          resumeProjects: {
            maxProjects: 3,
            lockedProjectIds: ["a", "b", "c"],
            aiSelectableProjectIds: [],
          },
        })}
        onToggle={vi.fn()}
        disabled={false}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeChecked();
      expect(checkbox).toBeDisabled();
    }
    expect(screen.getAllByText("Must include")).toHaveLength(3);
    expect(screen.queryByText("excluded")).not.toBeInTheDocument();
  });

  it("blocks another manual choice once the target is filled", () => {
    const onToggle = vi.fn();
    const catalog = ["a", "b"].map((id) =>
      createResumeProjectCatalogItem({ id, name: id }),
    );
    render(
      <ProjectSelector
        catalog={catalog}
        resolution={resolveResumeProjectSelection({
          catalog,
          resumeProjects: {
            maxProjects: 1,
            lockedProjectIds: [],
            aiSelectableProjectIds: ["a", "b"],
          },
          selectedProjectIds: ["a"],
        })}
        onToggle={onToggle}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /b/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText("Remove a project first.")).toBeVisible();
  });
});

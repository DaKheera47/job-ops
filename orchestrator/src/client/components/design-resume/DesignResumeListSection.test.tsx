import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Accordion } from "@/components/ui/accordion";
import { DesignResumeListSection } from "./DesignResumeListSection";
import type { ItemDefinition } from "./definitions";

const projectsDefinition: ItemDefinition = {
  key: "projects",
  title: "Projects",
  singularTitle: "Project",
  description: "Projects used for tailoring.",
  primaryField: "name",
  secondaryField: "period",
  fields: [],
  createItem: () => ({
    id: "new-project",
    name: "",
    period: "",
  }),
};

const projects = [
  { id: "project-1", name: "Apollo", period: "2024" },
  { id: "project-2", name: "Beacon", period: "2025" },
];

function renderListSection(onUpdateItems = vi.fn()) {
  render(
    <Accordion type="multiple" defaultValue={["projects"]}>
      <DesignResumeListSection
        definition={projectsDefinition}
        items={projects}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onUpdateItems={onUpdateItems}
      />
    </Accordion>,
  );
  return onUpdateItems;
}

describe("DesignResumeListSection", () => {
  it("asks for confirmation before removing an item", () => {
    const onUpdateItems = renderListSection();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(
      screen.getByRole("alertdialog", { name: "Remove project?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This will remove Apollo from your Resume Studio. You can add it again later, but this change will be saved.",
      ),
    ).toBeInTheDocument();
    expect(onUpdateItems).not.toHaveBeenCalled();
  });

  it("does not remove an item when confirmation is cancelled", () => {
    const onUpdateItems = renderListSection();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onUpdateItems).not.toHaveBeenCalled();
  });

  it("removes the selected item after confirmation", () => {
    const onUpdateItems = renderListSection();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    const dialog = screen.getByRole("alertdialog", {
      name: "Remove project?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(onUpdateItems).toHaveBeenCalledWith([projects[0]]);
  });

  it("shows max project selection controls for project sections", () => {
    const onMaxProjectsChange = vi.fn();
    render(
      <Accordion type="multiple" defaultValue={["projects"]}>
        <DesignResumeListSection
          definition={projectsDefinition}
          items={projects}
          onAdd={vi.fn()}
          onEdit={vi.fn()}
          onUpdateItems={vi.fn()}
          projectPolicy={{
            getMode: () => "ai-selectable",
            onModeChange: vi.fn(),
            maxProjects: 2,
            minProjects: 0,
            maxProjectsTotal: 2,
            onMaxProjectsChange,
          }}
        />
      </Accordion>,
    );

    const maxProjectsInput = screen.getByLabelText(
      "Maximum projects in Tailored Resumes",
    );
    expect(maxProjectsInput).toHaveValue(2);

    fireEvent.change(maxProjectsInput, { target: { value: "1" } });

    expect(onMaxProjectsChange).toHaveBeenCalledWith(1);
  });
});

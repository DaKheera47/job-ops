import type { DesignResumeJson } from "@shared/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemDialog, type ItemFieldConfig } from "./ItemDialog";

function makeResumeJson(): DesignResumeJson {
  return {
    basics: {},
    summary: {},
    sections: {},
  } as DesignResumeJson;
}

describe("ItemDialog", () => {
  it("uses tokenized input for tags fields", () => {
    const onSave = vi.fn();
    const fields: ItemFieldConfig[] = [
      {
        key: "keywords",
        label: "Keywords",
        type: "tags",
        placeholder: "Add keywords",
      },
    ];

    render(
      <ItemDialog
        open
        title="Edit item"
        description="Dialog description"
        item={{ id: "item-1", keywords: ["React"] }}
        fields={fields}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    const collapsedTokens = screen.getByTestId(
      "design-resume-item-keywords-collapsed-tokens",
    );
    expect(within(collapsedTokens).getByText("React")).toBeInTheDocument();

    const input = screen.getByLabelText("Keywords");
    fireEvent.change(input, { target: { value: "TypeScript, Next.js" } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        keywords: ["React", "TypeScript", "Next.js"],
      }),
    );
  });

  it("trims text input values before saving", () => {
    const onSave = vi.fn();
    const fields: ItemFieldConfig[] = [
      { key: "name", label: "Name", type: "text" },
    ];

    render(
      <ItemDialog
        open
        title="Edit item"
        description="Dialog description"
        item={{ id: "item-2", name: "" }}
        fields={fields}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "  Python  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Python",
      }),
    );
  });

  it("shows AI assist only for opted-in fields", () => {
    const fields: ItemFieldConfig[] = [
      { key: "name", label: "Name", type: "text", aiAssist: true },
      { key: "website.url", label: "Website", type: "text" },
    ];

    render(
      <ItemDialog
        open
        title="Edit item"
        description="Dialog description"
        item={{ id: "item-3", name: "Project", website: { url: "" } }}
        fields={fields}
        resumeJson={makeResumeJson()}
        aiSection="Projects"
        aiPathPrefix="sections.projects.items.0"
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /open ai assistant for name/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open ai assistant for website/i }),
    ).not.toBeInTheDocument();
  });
});

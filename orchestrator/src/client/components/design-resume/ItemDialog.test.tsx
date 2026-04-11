import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemDialog, type ItemFieldConfig } from "./ItemDialog";

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

    expect(screen.getByText("Currently selected: React")).toBeInTheDocument();

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
});

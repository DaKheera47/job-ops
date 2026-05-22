import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BasicsCustomFieldsSection } from "./DesignResumeInlineSections";

describe("BasicsCustomFieldsSection", () => {
  it("lets the custom fields section title be renamed", () => {
    const onUpdateTitle = vi.fn();

    render(
      <BasicsCustomFieldsSection
        title="Custom Fields"
        customFields={[]}
        onUpdateTitle={onUpdateTitle}
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Section title"), {
      target: { value: "Highlights" },
    });

    expect(onUpdateTitle).toHaveBeenCalledWith("Highlights");
  });

  it("lets each custom field card have its own title", () => {
    const onChange = vi.fn();

    render(
      <BasicsCustomFieldsSection
        title="Custom Fields"
        customFields={[
          { id: "field-1", title: "", icon: "", text: "", link: "" },
        ]}
        onUpdateTitle={vi.fn()}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Availability" },
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: "field-1", title: "Availability", icon: "", text: "", link: "" },
    ]);
  });
});

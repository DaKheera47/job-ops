import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDesignResumeAssetContentBlob: vi.fn(),
}));

vi.mock("@client/api/settings-profile", () => ({
  getDesignResumeAssetContentBlob: mocks.getDesignResumeAssetContentBlob,
}));

import {
  BasicsCustomFieldsSection,
  PictureSection,
} from "./DesignResumeInlineSections";

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

  it("loads JobOps asset picture previews through the authenticated blob API", async () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:preview");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    mocks.getDesignResumeAssetContentBlob.mockResolvedValue(
      new Blob(["image"], { type: "image/png" }),
    );

    const { unmount } = render(
      <PictureSection
        picture={{ url: "/api/design-resume/assets/asset-1/content" }}
        pictureUploading={false}
        pictureEnabled={true}
        onUploadPicture={vi.fn()}
        onDeletePicture={vi.fn()}
        onUpdatePicture={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByAltText("Resume Studio profile").getAttribute("src"),
      ).toBe("blob:preview");
    });

    expect(mocks.getDesignResumeAssetContentBlob).toHaveBeenCalledWith(
      "/api/design-resume/assets/asset-1/content",
    );

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:preview");

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });
});

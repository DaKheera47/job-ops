import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./RichTextEditor";

describe("RichTextEditor", () => {
  it("renders heading content and exposes heading controls", async () => {
    const { container } = render(
      <RichTextEditor
        value="<h2>Why this role</h2><p>Because the team and mission fit.</p>"
        onChange={vi.fn()}
        formatLabel={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: /heading 1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /heading 2/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /heading 3/i }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(container.querySelector("h2")).toHaveTextContent("Why this role");
    });
  });
});

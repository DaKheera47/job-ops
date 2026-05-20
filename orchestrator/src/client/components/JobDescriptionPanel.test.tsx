import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobDescriptionPanel } from "./JobDescriptionPanel";

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: () => ({
    renderMarkdownInJobDescriptions: true,
  }),
}));

describe("JobDescriptionPanel", () => {
  it("renders sanitized HTML job descriptions with structure preserved", () => {
    const { container } = render(
      <JobDescriptionPanel
        collapsible={false}
        description={
          "<h2>Senior Engineer</h2><ul><li>Build systems</li></ul><script>alert(1)</script>"
        }
      />,
    );

    expect(
      screen.getByRole("heading", { name: /senior engineer/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Build systems")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });
});

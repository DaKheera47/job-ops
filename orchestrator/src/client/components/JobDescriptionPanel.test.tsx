import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobDescriptionPanel } from "./JobDescriptionPanel";

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: () => ({
    renderMarkdownInJobDescriptions: true,
  }),
}));

describe("JobDescriptionPanel", () => {
  it("renders normalized text instead of raw HTML when markdown mode is enabled", () => {
    const { container } = render(
      <JobDescriptionPanel
        collapsible={false}
        description={
          "<strong>Senior Engineer</strong><script>alert(1)</script>"
        }
      />,
    );

    expect(screen.getByText(/senior engineer/i)).toBeInTheDocument();
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});

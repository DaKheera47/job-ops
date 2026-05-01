import { createResumeProjectCatalogItem } from "@shared/testing/factories.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSelector } from "./ProjectSelector";

describe("ProjectSelector", () => {
  it("renders html project descriptions as plain text", () => {
    render(
      <ProjectSelector
        catalog={[
          createResumeProjectCatalogItem({
            description:
              "<ul><li><p><strong>Built analytics</strong> using FastAPI.</p></li></ul>",
          }),
        ]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        maxProjects={3}
        disabled={false}
      />,
    );

    expect(screen.getByText("Built analytics using FastAPI.")).toBeVisible();
    expect(screen.queryByText(/<strong>/)).not.toBeInTheDocument();
  });
});

import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { createJob } from "../../../../../shared/src/testing/factories";
import { JobPageLeftSidebar } from "./JobPageLeftSidebar";

const renderSidebar = (score: number | null) =>
  render(
    <MemoryRouter>
      <JobPageLeftSidebar
        job={createJob({ suitabilityScore: score })}
        activeMemoryView="overview"
        baseJobPath="/job/job-1"
        selectedProjects={[]}
        sourceLabel="Manual"
      />
    </MemoryRouter>,
  );

describe("JobPageLeftSidebar score ring", () => {
  it.each([
    [70, "border-emerald-400/60"],
    [65, "border-amber-400/60"],
    [59, "border-slate-500/55"],
    [null, "border-border/60"],
  ])("uses the expected band for score %s", (score, expectedClass) => {
    renderSidebar(score);

    const ring = screen.getByRole("img", {
      name:
        score === null
          ? "Suitability score not available"
          : `Suitability score ${score}`,
    });

    expect(ring).toHaveClass(expectedClass);
    expect(
      within(ring).getByText(score === null ? "—" : String(score)),
    ).toBeInTheDocument();
  });
});

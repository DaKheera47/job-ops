import { createJob } from "@shared/testing/factories.js";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { JobPageLeftSidebar } from "./JobPageLeftSidebar";

type JobOverrides = Parameters<typeof createJob>[0];

const renderSidebar = (jobOverrides: JobOverrides = {}) =>
  render(
    <MemoryRouter>
      <JobPageLeftSidebar
        job={createJob(jobOverrides)}
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
    [null, "border-destructive/40"],
  ])("uses the expected band for score %s", (score, expectedClass) => {
    renderSidebar({ suitabilityScore: score });

    const ring = screen.getByRole("img", {
      name:
        score === null
          ? "AI misconfiguration or service error. Please check your settings and AI service status."
          : `Suitability score ${score}`,
    });

    expect(ring).toHaveClass(expectedClass);
    expect(
      within(ring).getByText(score === null ? "!" : String(score)),
    ).toBeInTheDocument();
  });
});

describe("JobPageLeftSidebar application details", () => {
  it("hides the applied row when the job has not been applied to yet", () => {
    renderSidebar({ appliedAt: null });

    expect(screen.queryByText("Applied")).not.toBeInTheDocument();
    expect(screen.queryByText("Not marked")).not.toBeInTheDocument();
  });

  it("shows the applied row when the job has an applied timestamp", () => {
    renderSidebar({ appliedAt: "2026-05-01T12:00:00.000Z" });

    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByText(/1 May 2026/)).toBeInTheDocument();
  });
});

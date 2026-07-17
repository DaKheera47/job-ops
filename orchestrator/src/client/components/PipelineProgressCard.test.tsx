import type { PipelineProgressState } from "@shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PipelineProgressCard } from "./PipelineProgressCard";

const progress: PipelineProgressState = {
  step: "scoring",
  message: "Ranking discovered jobs…",
  crawlingSource: null,
  crawlingSourcesCompleted: 3,
  crawlingSourcesTotal: 3,
  crawlingTermsProcessed: 2,
  crawlingTermsTotal: 2,
  crawlingListPagesProcessed: 10,
  crawlingListPagesTotal: 10,
  crawlingJobCardsFound: 100,
  crawlingJobPagesEnqueued: 80,
  crawlingJobPagesSkipped: 20,
  crawlingJobPagesProcessed: 80,
  jobsDiscovered: 100,
  jobsScored: 50,
  jobsExceptional: 7,
  jobsProcessed: 10,
  totalToProcess: 20,
};

describe("PipelineProgressCard", () => {
  it("shows stage progress and global metrics", () => {
    render(<PipelineProgressCard progress={progress} elapsedSeconds={90} />);

    expect(screen.getByText("Scoring matches")).toBeInTheDocument();
    expect(screen.queryByText("Overall progress")).toBeNull();
    expect(screen.queryByText("Live")).toBeNull();
    expect(screen.getByText("35%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "35",
    );
    expect(screen.getByText("Discovered")).toBeInTheDocument();
    expect(screen.getByText("Awaiting score")).toBeInTheDocument();
    expect(screen.getByText("Exceptional matches")).toBeInTheDocument();
  });

  it("rolls the active job forward as stage progress changes", () => {
    const { container, rerender } = render(
      <PipelineProgressCard
        progress={{
          ...progress,
          currentJob: {
            id: "job-1",
            title: "Frontend Engineer",
            employer: "Monzo",
          },
        }}
      />,
    );

    expect(
      screen.getByTitle("Ranking Frontend Engineer against your profile"),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-live-job-title]")).toHaveTextContent(
      "Frontend Engineer",
    );

    rerender(
      <PipelineProgressCard
        progress={{
          ...progress,
          currentJob: {
            id: "job-2",
            title: "Platform Engineer",
            employer: "Stripe",
          },
        }}
      />,
    );

    expect(
      screen.getByTitle("Ranking Platform Engineer against your profile"),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-live-job-title]")).toHaveTextContent(
      "Platform Engineer",
    );
  });

  it("shows failures clearly", () => {
    render(
      <PipelineProgressCard
        progress={{ ...progress, step: "failed", error: "Scoring timed out." }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Scoring timed out.");
  });

  it("delegates scoring restart", () => {
    const onResumeScoring = vi.fn();
    render(
      <PipelineProgressCard
        progress={{
          ...progress,
          step: "configuration_required",
          error: "Add an API key.",
        }}
        onResumeScoring={onResumeScoring}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Restart scoring" }));
    expect(onResumeScoring).toHaveBeenCalledOnce();
  });
});

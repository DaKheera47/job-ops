import { createJob } from "@shared/testing/factories.js";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { JobPageRightSidebar } from "./JobPageRightSidebar";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

const noop = vi.fn();

function renderRightSidebar(overrides: Parameters<typeof createJob>[0] = {}) {
  const job = createJob({
    status: "ready",
    pdfPath: "data/pdfs/resume_job-1.pdf",
    pdfFreshness: "stale",
    ...overrides,
  });

  return render(
    <JobPageRightSidebar
      job={job}
      tasks={[]}
      jobLink={job.jobUrl}
      isDiscovered={job.status === "discovered"}
      isReady={job.status === "ready"}
      isApplied={job.status === "applied"}
      isInProgress={job.status === "in_progress"}
      canLogEvents={false}
      isBusy={false}
      isUploadingPdf={false}
      pdfActionsDisabled={false}
      pdfRegeneratingReason={null}
      pdfViewLabel="View old PDF"
      pdfDownloadLabel="Download old PDF"
      onStartTailoring={noop}
      onMarkApplied={noop}
      onMoveToInProgress={noop}
      onOpenLogEvent={noop}
      onEditTailoring={noop}
      onViewPdf={noop}
      onDownloadPdf={noop}
      onUploadPdf={noop}
      onRegeneratePdf={noop}
      onSkip={noop}
      onOpenEditDetails={noop}
      onViewJobDescription={noop}
      onCopyJobInfo={noop}
      onRescore={noop}
      onCheckSponsor={noop}
    />,
  );
}

describe("JobPageRightSidebar actions", () => {
  it("includes the orchestrator detail menu actions on the job page", () => {
    renderRightSidebar();

    expect(
      screen.getByRole("button", { name: /edit details/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view job description/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy job info/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /recalculate match/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /replace pdf/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: /view old pdf/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /download old pdf/i }),
    ).toBeInTheDocument();
  });

  it("uses upload wording when the job has no resume PDF", () => {
    renderRightSidebar({ pdfPath: null, pdfFreshness: "missing" });

    expect(
      screen.getAllByRole("button", { name: /upload pdf/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /download pdf/i })).toBeNull();
  });
});

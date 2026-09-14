import { triggerElementResize } from "@client/test/dom-measurement";
import { setupWindowVirtualizerTestEnvironment } from "@client/test/virtualization";
import { createJob } from "@shared/testing/factories.js";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef, type Ref } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VirtualListHandle } from "@/client/lib/virtual-list";
import { JobListPanel } from "./JobListPanel";

const createJobs = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    createJob({
      id: `job-${index + 1}`,
      title: `Job ${index + 1}`,
      employer: `Employer ${index + 1}`,
    }),
  );

let virtualizationEnvironment: ReturnType<
  typeof setupWindowVirtualizerTestEnvironment
> | null = null;

afterEach(() => {
  virtualizationEnvironment?.cleanup();
  virtualizationEnvironment = null;
});

describe("JobListPanel", () => {
  it("shows a loading state when fetching jobs", () => {
    render(
      <JobListPanel
        isLoading
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading jobs...")).toBeInTheDocument();
  });

  it("shows the tab empty state copy when no jobs exist", () => {
    render(
      <JobListPanel
        isLoading={false}
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
        primaryEmptyStateAction={{
          label: "Tailor discovered jobs",
          onClick: vi.fn(),
        }}
        secondaryEmptyStateAction={{
          label: "Run search",
          onClick: vi.fn(),
        }}
      />,
    );

    expect(screen.getByText("No jobs found")).toBeInTheDocument();
    expect(
      screen.getByText("Run a search to discover and process new jobs."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tailor discovered jobs/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run search/i }),
    ).toBeInTheDocument();
  });

  it("fires empty state actions when provided", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();

    render(
      <JobListPanel
        isLoading={false}
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
        primaryEmptyStateAction={{
          label: "Tailor discovered jobs",
          onClick: onPrimary,
        }}
        secondaryEmptyStateAction={{
          label: "Run search",
          onClick: onSecondary,
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /tailor discovered jobs/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /run search/i }));

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("prefers a custom empty state message when provided", () => {
    render(
      <JobListPanel
        isLoading={false}
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="all"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
        emptyStateMessage="No applied jobs found for this date range."
      />,
    );

    expect(
      screen.getByText("No applied jobs found for this date range."),
    ).toBeInTheDocument();
  });

  it("renders jobs and notifies when a job is selected", () => {
    const onSelectJob = vi.fn();
    const onToggleSelectJob = vi.fn();
    const onToggleSelectAll = vi.fn();
    const jobs = [
      createJob({ id: "job-1", title: "Backend Engineer" }),
      createJob({
        id: "job-2",
        title: "Frontend Engineer",
        employer: "Globex",
      }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId="job-1"
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={onSelectJob}
        onToggleSelectJob={onToggleSelectJob}
        onToggleSelectAll={onToggleSelectAll}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Backend Engineer/i }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Frontend Engineer/i }));
    expect(onSelectJob).toHaveBeenCalledWith("job-2");
  });

  it("shows discovered jobs without scores as awaiting AI scoring", () => {
    const jobs = [
      createJob({
        id: "job-1",
        title: "Backend Engineer",
        status: "discovered",
        suitabilityScore: null,
        suitabilityReason: null,
      }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="discovered"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText("Waiting for AI scoring to finish."),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("AI misconfiguration or service error."),
    ).not.toBeInTheDocument();
  });

  it("shows a yellow status dot for flagged reposts without an inline badge", () => {
    const jobs = [
      createJob({
        id: "job-1",
        title: "Backend Engineer",
        appliedDuplicateMatch: {
          jobId: "job-applied",
          title: "Backend Engineer",
          employer: "Acme Labs",
          appliedAt: "2026-04-01T10:00:00.000Z",
          score: 96,
          titleScore: 97,
          employerScore: 95,
        },
      }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.queryByText("Previously Applied")).not.toBeInTheDocument();
    expect(screen.getByTitle("Previously Applied")).toHaveClass(
      "bg-yellow-400",
    );
  });

  it("toggles row selection and select-all", () => {
    const onToggleSelectJob = vi.fn();
    const onToggleSelectAll = vi.fn();
    const jobs = [
      createJob({ id: "job-1", title: "Backend Engineer" }),
      createJob({ id: "job-2", title: "Frontend Engineer" }),
    ];

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId="job-1"
        selectedJobIds={new Set(["job-1"])}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={onToggleSelectJob}
        onToggleSelectAll={onToggleSelectAll}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select Backend Engineer"));
    expect(onToggleSelectJob).toHaveBeenCalledWith("job-1");

    fireEvent.click(screen.getByLabelText("Select all filtered jobs"));
    expect(onToggleSelectAll).toHaveBeenCalledWith(true);
  });

  it("shows checkbox only for selected or checked rows", () => {
    const jobs = [createJob({ id: "job-1", title: "Backend Engineer" })];
    const { rerender } = render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Select Backend Engineer")).toHaveClass(
      "opacity-0",
    );

    rerender(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId="job-1"
        selectedJobIds={new Set()}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Select Backend Engineer")).toHaveClass(
      "opacity-100",
    );

    rerender(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId={null}
        selectedJobIds={new Set(["job-1"])}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Select Backend Engineer")).toHaveClass(
      "opacity-100",
    );
  });

  it("keeps large lists virtualized and scrolls offscreen rows into view", async () => {
    virtualizationEnvironment = setupWindowVirtualizerTestEnvironment({
      viewportHeight: 240,
      rowHeight: 72,
    });
    const jobs = createJobs(40);

    render(
      <JobListPanel
        isLoading={false}
        jobs={jobs}
        activeJobs={jobs}
        selectedJobId="job-1"
        selectedJobIds={new Set(["job-1"])}
        activeTab="ready"
        onSelectJob={vi.fn()}
        onToggleSelectJob={vi.fn()}
        onToggleSelectAll={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("select-job-35")).not.toBeInTheDocument();
    const renderedRows = screen.getAllByTestId(/select-job-/);
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(jobs.length);

    act(() => {
      window.scrollY = 2800;
      window.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("select-job-35")).toBeInTheDocument();
    });
  });
  describe("when content above the list shifts it down the document", () => {
    const ROW_HEIGHT = 84;
    const VIEWPORT_HEIGHT = 240;

    const renderList = (
      jobs: ReturnType<typeof createJobs>,
      ref?: Ref<VirtualListHandle>,
    ) =>
      render(
        <JobListPanel
          ref={ref}
          isLoading={false}
          jobs={jobs}
          activeJobs={jobs}
          selectedJobId={null}
          selectedJobIds={new Set()}
          activeTab="ready"
          onSelectJob={vi.fn()}
          onToggleSelectJob={vi.fn()}
          onToggleSelectAll={vi.fn()}
        />,
      );

    const scrollWindowTo = (offset: number) => {
      act(() => {
        window.scrollY = offset;
        window.dispatchEvent(new Event("scroll"));
      });
    };

    const rowFor = (jobId: string) =>
      screen.getByTestId(`select-${jobId}`).closest("[data-virtual-row]");

    it("renders the rows the viewport actually covers", async () => {
      virtualizationEnvironment = setupWindowVirtualizerTestEnvironment({
        viewportHeight: VIEWPORT_HEIGHT,
        rowHeight: ROW_HEIGHT,
        listOffsetTop: 1200,
      });
      const jobs = createJobs(60);

      renderList(jobs);

      // Puts the 21st row exactly at the top of the viewport.
      scrollWindowTo(1200 + 20 * ROW_HEIGHT);

      await waitFor(() => {
        expect(screen.getByTestId("select-job-21")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("select-job-45")).not.toBeInTheDocument();
      expect(rowFor("job-21")).toHaveStyle({
        transform: `translateY(${20 * ROW_HEIGHT}px)`,
      });
    });

    it("keeps the list container sized to the rows alone", async () => {
      virtualizationEnvironment = setupWindowVirtualizerTestEnvironment({
        viewportHeight: VIEWPORT_HEIGHT,
        rowHeight: ROW_HEIGHT,
        listOffsetTop: 1200,
      });
      const jobs = createJobs(60);

      const { container } = renderList(jobs);

      await waitFor(() => {
        expect(container.querySelector("[data-virtual-list]")).toHaveStyle({
          height: `${60 * ROW_HEIGHT}px`,
        });
      });
    });

    it("realigns when the pipeline card mounts above the list", async () => {
      virtualizationEnvironment = setupWindowVirtualizerTestEnvironment({
        viewportHeight: VIEWPORT_HEIGHT,
        rowHeight: ROW_HEIGHT,
        listOffsetTop: 400,
      });
      const jobs = createJobs(60);

      renderList(jobs);
      scrollWindowTo(400 + 20 * ROW_HEIGHT);

      await waitFor(() => {
        expect(screen.getByTestId("select-job-21")).toBeInTheDocument();
      });

      // A search run starts: the pipeline progress card pushes the list down.
      act(() => {
        virtualizationEnvironment?.setListOffsetTop(1200);
        triggerElementResize(document.body);
      });

      await waitFor(() => {
        expect(screen.getByTestId("select-job-3")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("select-job-31")).not.toBeInTheDocument();
      expect(rowFor("job-11")).toHaveStyle({
        transform: `translateY(${10 * ROW_HEIGHT}px)`,
      });
    });

    it("scrolls to a row at its document position", async () => {
      virtualizationEnvironment = setupWindowVirtualizerTestEnvironment({
        viewportHeight: VIEWPORT_HEIGHT,
        rowHeight: ROW_HEIGHT,
        listOffsetTop: 1200,
        documentHeight: 1200 + 60 * ROW_HEIGHT + VIEWPORT_HEIGHT,
      });
      const jobs = createJobs(60);
      const handleRef = createRef<VirtualListHandle>();

      renderList(jobs, handleRef);

      act(() => {
        handleRef.current?.scrollToIndex(30, { align: "start" });
      });

      await waitFor(() => {
        expect(window.scrollY).toBe(1200 + 30 * ROW_HEIGHT);
      });
    });
  });
});

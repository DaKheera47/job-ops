import type { Job } from "@shared/types.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { JobCommandBar } from "./JobCommandBar";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: originalScrollIntoView,
  });
});

const createJob = (overrides: Partial<Job>): Job => ({
  id: "job-1",
  source: "linkedin",
  sourceJobId: null,
  jobUrlDirect: null,
  datePosted: null,
  title: "Backend Engineer",
  employer: "Acme Labs",
  employerUrl: null,
  jobUrl: "https://example.com/job-1",
  applicationLink: null,
  disciplines: null,
  deadline: null,
  salary: null,
  location: "California",
  degreeRequired: null,
  starting: null,
  jobDescription: null,
  status: "ready",
  outcome: null,
  closedAt: null,
  suitabilityScore: 90,
  suitabilityReason: null,
  tailoredSummary: null,
  tailoredHeadline: null,
  tailoredSkills: null,
  selectedProjectIds: null,
  pdfPath: null,
  notionPageId: null,
  sponsorMatchScore: null,
  sponsorMatchNames: null,
  jobType: null,
  salarySource: null,
  salaryInterval: null,
  salaryMinAmount: null,
  salaryMaxAmount: null,
  salaryCurrency: null,
  isRemote: null,
  jobLevel: null,
  jobFunction: null,
  listingType: null,
  emails: null,
  companyIndustry: null,
  companyLogo: null,
  companyUrlDirect: null,
  companyAddresses: null,
  companyNumEmployees: null,
  companyRevenue: null,
  companyDescription: null,
  skills: null,
  experienceRange: null,
  companyRating: null,
  companyReviewsCount: null,
  vacancyCount: null,
  workFromHomeType: null,
  discoveredAt: "2025-01-01T00:00:00Z",
  processedAt: null,
  appliedAt: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  ...overrides,
});

describe("JobCommandBar", () => {
  const openWithKeyboard = () => {
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  };

  it("opens the command dialog with keyboard shortcut", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();

    expect(
      screen.getByPlaceholderText(
        "Search jobs by job title or company name...",
      ),
    ).toBeInTheDocument();
  });

  it("creates discovered lock from @disc + Tab", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1", status: "discovered" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@disc" } });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(screen.getByText("@discovered")).toBeInTheDocument();
  });

  it("creates lock from @ready + Enter", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1", status: "ready" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@ready" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("@ready")).toBeInTheDocument();
  });

  it("adds lock-colored border and shadow to dialog when a lock is active", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1", status: "discovered" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).not.toContain("border-sky-500/50");

    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@disc" } });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(dialog).toHaveClass("border-sky-500/50");
    expect(dialog.className).toContain(
      "shadow-[0_0_0_1px_rgba(14,165,233,0.2),0_0_36px_-12px_rgba(14,165,233,0.55)]",
    );
  });

  it("shows selectable filter suggestion for @ tokens", () => {
    render(
      <JobCommandBar
        jobs={[
          createJob({
            id: "ready-job",
            title: "Ready Engineer",
            status: "ready",
          }),
        ]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@ready" } });

    expect(screen.getByText("Lock to @ready")).toBeInTheDocument();
    expect(screen.queryByText("No jobs found.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Lock to @ready"));

    expect(screen.getByText("@ready")).toBeInTheDocument();
    expect(screen.getByText("Ready Engineer")).toBeInTheDocument();
  });

  it("shows all lock suggestions for bare @", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "ready-job", status: "ready" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@" } });

    expect(screen.getByText("Lock to @ready")).toBeInTheDocument();
    expect(screen.getByText("Lock to @discovered")).toBeInTheDocument();
    expect(screen.getByText("Lock to @applied")).toBeInTheDocument();
    expect(screen.getByText("Lock to @skipped")).toBeInTheDocument();
    expect(screen.getByText("Lock to @expired")).toBeInTheDocument();
  });

  it("searches by company name and routes to the matched state", () => {
    const onSelectJob = vi.fn();
    const jobs: Job[] = [
      createJob({
        id: "ready-job",
        title: "Backend Engineer",
        status: "ready",
      }),
      createJob({
        id: "applied-job",
        title: "Platform Engineer",
        employer: "Globex",
        status: "applied",
      }),
    ];

    render(<JobCommandBar jobs={jobs} onSelectJob={onSelectJob} />);

    openWithKeyboard();
    fireEvent.change(
      screen.getByPlaceholderText(
        "Search jobs by job title or company name...",
      ),
      {
        target: { value: "Globex" },
      },
    );
    fireEvent.click(screen.getByText("Platform Engineer"));

    expect(onSelectJob).toHaveBeenCalledWith("applied", "applied-job");
  });

  it("returns only locked status results", () => {
    const jobs: Job[] = [
      createJob({
        id: "disc-1",
        title: "Frontend Engineer",
        status: "discovered",
      }),
      createJob({
        id: "applied-1",
        title: "Frontend Engineer",
        status: "applied",
      }),
    ];
    render(<JobCommandBar jobs={jobs} onSelectJob={vi.fn()} />);

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@disc" } });
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.change(input, { target: { value: "Frontend" } });

    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
    expect(screen.queryByText("@applied")).not.toBeInTheDocument();
    expect(screen.queryByText("Applied")).not.toBeInTheDocument();
  });

  it("ranks closest match first within a lock", () => {
    const jobs: Job[] = [
      createJob({
        id: "ready-job",
        title: "Junior Software Engineer (Data Products)",
        employer: "Yapily",
        status: "ready",
      }),
      createJob({
        id: "discovered-job",
        title: "Junior Web Developer",
        employer: "Joinrs",
        status: "discovered",
      }),
      createJob({
        id: "discovered-job-2",
        title: "Junior Software Engineer",
        employer: "Nestle",
        status: "discovered",
      }),
    ];

    render(<JobCommandBar jobs={jobs} onSelectJob={vi.fn()} />);

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@disc" } });
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.change(input, {
      target: { value: "joinrs" },
    });

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Joinrs");
    expect(options[0]).toHaveTextContent("Junior Web Developer");
  });

  it("replaces an existing lock when new @ token is tab-completed", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1", status: "ready" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@ready" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.getByText("@ready")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "@app" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.getByText("@applied")).toBeInTheDocument();
    expect(screen.queryByText("@ready")).not.toBeInTheDocument();
  });

  it("does not show an x remove button on the lock chip", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1", status: "ready" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@ready" } });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(screen.getByText("@ready")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Remove ready filter"),
    ).not.toBeInTheDocument();
  });

  it("removes lock with Backspace when query is empty", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1", status: "ready" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@ready" } });
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(screen.queryByText("@ready")).not.toBeInTheDocument();
  });

  it("clears lock on Escape and keeps dialog open", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1", status: "ready" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@ready" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.getByText("@ready")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByText("@ready")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "Search jobs by job title or company name...",
      ),
    ).toBeInTheDocument();
  });

  it("clears active lock when the dialog closes", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1", status: "ready" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@ready" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.getByText("@ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    openWithKeyboard();

    expect(screen.queryByText("@ready")).not.toBeInTheDocument();
  });

  it("treats @all as invalid and does not lock", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1", status: "ready" })]}
        onSelectJob={vi.fn()}
      />,
    );

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    fireEvent.change(input, { target: { value: "@all" } });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(
      screen.queryByText(/^@(ready|discovered|applied|skipped|expired)$/),
    ).not.toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("@all");
  });

  it("excludes processing jobs from every lock scope", () => {
    const jobs: Job[] = [
      createJob({
        id: "processing-job",
        title: "Processing-only keyword",
        employer: "Queue Corp",
        status: "processing",
      }),
      createJob({
        id: "ready-job",
        title: "Ready Engineer",
        status: "ready",
      }),
      createJob({
        id: "disc-job",
        title: "Discovered Engineer",
        status: "discovered",
      }),
      createJob({
        id: "applied-job",
        title: "Applied Engineer",
        status: "applied",
      }),
      createJob({
        id: "skipped-job",
        title: "Skipped Engineer",
        status: "skipped",
      }),
      createJob({
        id: "expired-job",
        title: "Expired Engineer",
        status: "expired",
      }),
    ];
    render(<JobCommandBar jobs={jobs} onSelectJob={vi.fn()} />);

    openWithKeyboard();
    const input = screen.getByPlaceholderText(
      "Search jobs by job title or company name...",
    );
    const lockTokens = ["@ready", "@disc", "@applied", "@skip", "@exp"];

    for (const token of lockTokens) {
      fireEvent.change(input, { target: { value: token } });
      fireEvent.keyDown(input, { key: "Tab" });
      fireEvent.change(input, { target: { value: "Processing-only keyword" } });
      expect(
        screen.queryByText("Processing-only keyword"),
      ).not.toBeInTheDocument();
    }
  });
});

import type { Job } from "@shared/types.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobListPanel } from "./JobListPanel";

const createJob = (overrides: Partial<Job> = {}): Job => ({
  id: "job-1",
  source: "linkedin",
  sourceJobId: null,
  jobUrlDirect: null,
  datePosted: null,
  title: "Backend Engineer",
  employer: "Acme",
  employerUrl: null,
  jobUrl: "https://example.com/job",
  applicationLink: null,
  disciplines: null,
  deadline: null,
  salary: null,
  location: "London",
  degreeRequired: null,
  starting: null,
  jobDescription: "Build APIs",
  status: "ready",
  outcome: null,
  closedAt: null,
  suitabilityScore: 72,
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
  updatedAt: "2025-01-02T00:00:00Z",
  ...overrides,
});

describe("JobListPanel", () => {
  it("shows a loading state when fetching jobs", () => {
    render(
      <JobListPanel
        isLoading
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        activeTab="ready"
        searchQuery=""
        onSelectJob={vi.fn()}
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
        activeTab="ready"
        searchQuery=""
        onSelectJob={vi.fn()}
      />,
    );

    expect(screen.getByText("No jobs found")).toBeInTheDocument();
    expect(
      screen.getByText("Run the pipeline to discover and process new jobs."),
    ).toBeInTheDocument();
  });

  it("shows the query-specific empty state when searching", () => {
    render(
      <JobListPanel
        isLoading={false}
        jobs={[]}
        activeJobs={[]}
        selectedJobId={null}
        activeTab="ready"
        searchQuery="iOS"
        onSelectJob={vi.fn()}
      />,
    );

    expect(screen.getByText('No jobs match "iOS".')).toBeInTheDocument();
  });

  it("renders jobs and notifies when a job is selected", () => {
    const onSelectJob = vi.fn();
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
        activeTab="ready"
        searchQuery=""
        onSelectJob={onSelectJob}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Backend Engineer/i }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Frontend Engineer/i }));
    expect(onSelectJob).toHaveBeenCalledWith("job-2");
  });

  describe("salary display", () => {
    it("displays salary when provided", () => {
      const jobs = [
        createJob({
          id: "job-1",
          title: "Backend Engineer",
          salary: "$100,000 - $150,000",
        }),
      ];

      render(
        <JobListPanel
          isLoading={false}
          jobs={jobs}
          activeJobs={jobs}
          selectedJobId={null}
          activeTab="ready"
          searchQuery=""
          onSelectJob={vi.fn()}
        />,
      );

      expect(screen.getByText("$100,000 - $150,000")).toBeInTheDocument();
    });

    it("displays fallback text when salary is null", () => {
      const jobs = [
        createJob({
          id: "job-1",
          title: "Backend Engineer",
          salary: null,
        }),
      ];

      render(
        <JobListPanel
          isLoading={false}
          jobs={jobs}
          activeJobs={jobs}
          selectedJobId={null}
          activeTab="ready"
          searchQuery=""
          onSelectJob={vi.fn()}
        />,
      );

      expect(screen.getByText("Salary not listed")).toBeInTheDocument();
    });

    it("displays fallback text when salary is empty string", () => {
      const jobs = [
        createJob({
          id: "job-1",
          title: "Backend Engineer",
          salary: "",
        }),
      ];

      render(
        <JobListPanel
          isLoading={false}
          jobs={jobs}
          activeJobs={jobs}
          selectedJobId={null}
          activeTab="ready"
          searchQuery=""
          onSelectJob={vi.fn()}
        />,
      );

      expect(screen.getByText("Salary not listed")).toBeInTheDocument();
    });

    it("handles very long salary strings without breaking layout", () => {
      const longSalary =
        "GBP 100000-200000 / year with additional benefits and bonuses including stock options and comprehensive health coverage";
      const jobs = [
        createJob({
          id: "job-1",
          title: "Backend Engineer",
          salary: longSalary,
        }),
      ];

      render(
        <JobListPanel
          isLoading={false}
          jobs={jobs}
          activeJobs={jobs}
          selectedJobId={null}
          activeTab="ready"
          searchQuery=""
          onSelectJob={vi.fn()}
        />,
      );

      // Verify salary text is rendered
      const salaryText = screen.getByText((content, element) => {
        return (
          element?.tagName.toLowerCase() === "div" &&
          content.includes("GBP 100000-200000")
        );
      });
      expect(salaryText).toBeInTheDocument();

      // Verify truncate class is applied to prevent overflow
      expect(salaryText.classList.contains("truncate")).toBe(true);
      expect(salaryText.classList.contains("text-xs")).toBe(true);
      expect(salaryText.classList.contains("text-muted-foreground")).toBe(true);
    });

    it("maintains consistent layout with and without salary data", () => {
      const jobs = [
        createJob({
          id: "job-1",
          title: "Backend Engineer",
          salary: "$100k",
        }),
        createJob({
          id: "job-2",
          title: "Frontend Engineer",
          salary: null,
        }),
      ];

      const { container } = render(
        <JobListPanel
          isLoading={false}
          jobs={jobs}
          activeJobs={jobs}
          selectedJobId={null}
          activeTab="ready"
          searchQuery=""
          onSelectJob={vi.fn()}
        />,
      );

      // Both jobs should have the same number of child divs in their content area
      const jobButtons = container.querySelectorAll('button[type="button"]');
      expect(jobButtons).toHaveLength(2);

      // Each job should have the salary line (either actual salary or fallback)
      expect(screen.getByText("$100k")).toBeInTheDocument();
      expect(screen.getByText("Salary not listed")).toBeInTheDocument();
    });

    it("renders all job elements without visual regression when salary is added", () => {
      const jobs = [
        createJob({
          id: "job-1",
          title: "Backend Engineer",
          employer: "Acme",
          location: "London",
          salary: "$120,000",
          suitabilityScore: 85,
        }),
      ];

      const { container } = render(
        <JobListPanel
          isLoading={false}
          jobs={jobs}
          activeJobs={jobs}
          selectedJobId={null}
          activeTab="ready"
          searchQuery=""
          onSelectJob={vi.fn()}
        />,
      );

      // Verify status dot exists
      const statusDot = container.querySelector(".h-2.w-2.rounded-full");
      expect(statusDot).toBeInTheDocument();

      // Verify title
      expect(screen.getByText("Backend Engineer")).toBeInTheDocument();

      // Verify employer/location line
      expect(screen.getByText(/Acme/)).toBeInTheDocument();
      expect(screen.getByText(/London/)).toBeInTheDocument();

      // Verify salary line
      expect(screen.getByText("$120,000")).toBeInTheDocument();

      // Verify score
      expect(screen.getByText("85")).toBeInTheDocument();
    });
  });
});

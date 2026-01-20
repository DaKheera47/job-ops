import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { JobListPanel } from "./JobListPanel";
import type { Job } from "../../../shared/types";

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
      />
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
      />
    );

    expect(screen.getByText("No jobs found")).toBeInTheDocument();
    expect(screen.getByText("Run the pipeline to discover and process new jobs.")).toBeInTheDocument();
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
      />
    );

    expect(screen.getByText('No jobs match "iOS".')).toBeInTheDocument();
  });

  it("renders jobs and notifies when a job is selected", () => {
    const onSelectJob = vi.fn();
    const jobs = [
      createJob({ id: "job-1", title: "Backend Engineer" }),
      createJob({ id: "job-2", title: "Frontend Engineer", employer: "Globex" }),
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
      />
    );

    expect(screen.getByRole("button", { name: /Backend Engineer/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Frontend Engineer/i }));
    expect(onSelectJob).toHaveBeenCalledWith("job-2");
  });
});

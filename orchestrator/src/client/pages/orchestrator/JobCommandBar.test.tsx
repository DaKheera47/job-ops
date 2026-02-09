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

    fireEvent.click(
      screen.getByRole("button", { name: "Open job search command menu" }),
    );
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

  it("opens the command dialog with keyboard shortcut", () => {
    render(
      <JobCommandBar
        jobs={[createJob({ id: "job-1" })]}
        onSelectJob={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(
      screen.getByPlaceholderText(
        "Search jobs by job title or company name...",
      ),
    ).toBeInTheDocument();
  });
});

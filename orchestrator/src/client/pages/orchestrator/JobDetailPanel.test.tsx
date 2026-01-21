import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { JobDetailPanel } from "./JobDetailPanel";
import type { Job } from "../../../shared/types";
import * as api from "../../api";

vi.mock("@/components/ui/dropdown-menu", () => {
  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
    }) => (
      <button type="button" role="menuitem" onClick={() => onSelect?.()} {...props}>
        {children}
      </button>
    ),
    DropdownMenuSeparator: () => <div role="separator" />,
  };
});

vi.mock("../../components", () => ({
  DiscoveredPanel: ({ job }: { job: Job | null }) => (
    <div data-testid="discovered-panel">{job?.id ?? "no-job"}</div>
  ),
  JobHeader: () => <div data-testid="job-header" />,
  FitAssessment: () => <div data-testid="fit-assessment" />,
  TailoredSummary: () => <div data-testid="tailored-summary" />,
}));

vi.mock("../../components/ReadyPanel", () => ({
  ReadyPanel: ({ onEditDescription }: { onEditDescription?: () => void }) => (
    <div>
      <div data-testid="ready-panel" />
      <button type="button" onClick={() => onEditDescription?.()}>
        Edit description
      </button>
    </div>
  ),
}));

vi.mock("../../components/TailoringEditor", () => ({
  TailoringEditor: () => <div data-testid="tailoring-editor" />,
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
    formatJobForWebhook: vi.fn(() => "payload"),
  };
});

vi.mock("../../api", () => ({
  updateJob: vi.fn(),
  processJob: vi.fn(),
  generateJobPdf: vi.fn(),
  markAsApplied: vi.fn(),
  skipJob: vi.fn(),
  getProfile: vi.fn().mockResolvedValue({}),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

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
  applicationLink: "https://example.com/apply",
  disciplines: null,
  deadline: "2025-02-01",
  salary: "GBP 50k",
  location: "London",
  degreeRequired: null,
  starting: null,
  jobDescription: "Build APIs",
  status: "ready",
  suitabilityScore: 82,
  suitabilityReason: "Strong fit",
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

describe("JobDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the discovered panel when active tab is discovered", () => {
    const job = createJob({ id: "job-99", status: "discovered" });

    render(
      <JobDetailPanel
        activeTab="discovered"
        activeJobs={[job]}
        selectedJob={job}
        onSelectJobId={vi.fn()}
        onJobUpdated={vi.fn().mockResolvedValue(undefined)}
        onSetActiveTab={vi.fn()}
      />
    );

    expect(screen.getByTestId("discovered-panel")).toHaveTextContent("job-99");
  });



  it("shows an empty state when no job is selected", () => {
    render(
      <JobDetailPanel
        activeTab="all"
        activeJobs={[]}
        selectedJob={null}
        onSelectJobId={vi.fn()}
        onJobUpdated={vi.fn().mockResolvedValue(undefined)}
        onSetActiveTab={vi.fn()}
      />
    );

    expect(screen.getByText("No job selected")).toBeInTheDocument();
  });

  it("renders a stripped description preview for html content", () => {
    render(
      <JobDetailPanel
        activeTab="all"
        activeJobs={[]}
        selectedJob={createJob({ jobDescription: "<p>Hello <strong>world</strong></p>" })}
        onSelectJobId={vi.fn()}
        onJobUpdated={vi.fn().mockResolvedValue(undefined)}
        onSetActiveTab={vi.fn()}
      />
    );

    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("saves an edited description", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.updateJob).mockResolvedValue(undefined as any);

    render(
      <JobDetailPanel
        activeTab="all"
        activeJobs={[]}
        selectedJob={createJob({ jobDescription: "Original" })}
        onSelectJobId={vi.fn()}
        onJobUpdated={onJobUpdated}
        onSetActiveTab={vi.fn()}
      />
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: /description/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    fireEvent.change(screen.getByPlaceholderText("Enter job description..."), {
      target: { value: "Updated description" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(api.updateJob).toHaveBeenCalledWith("job-1", { jobDescription: "Updated description" })
    );
    expect(onJobUpdated).toHaveBeenCalled();
  });

  it("marks a job as applied from the action button", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.markAsApplied).mockResolvedValue(undefined as any);

    render(
      <JobDetailPanel
        activeTab="all"
        activeJobs={[]}
        selectedJob={createJob({ status: "ready" })}
        onSelectJobId={vi.fn()}
        onJobUpdated={onJobUpdated}
        onSetActiveTab={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /applied/i }));

    await waitFor(() => expect(api.markAsApplied).toHaveBeenCalledWith("job-1"));
    expect(onJobUpdated).toHaveBeenCalled();
  });

  it("skips a job from the menu", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.skipJob).mockResolvedValue(undefined as any);

    render(
      <JobDetailPanel
        activeTab="all"
        activeJobs={[]}
        selectedJob={createJob({ status: "ready" })}
        onSelectJobId={vi.fn()}
        onJobUpdated={onJobUpdated}
        onSetActiveTab={vi.fn()}
      />
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: /more actions/i }));
    const skipItem = await screen.findByRole("menuitem", { name: /skip job/i });
    fireEvent.click(skipItem);

    await waitFor(() => expect(api.skipJob).toHaveBeenCalledWith("job-1"));
    expect(onJobUpdated).toHaveBeenCalled();
  });
});

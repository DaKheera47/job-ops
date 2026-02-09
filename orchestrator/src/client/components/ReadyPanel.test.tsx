import type { Job } from "@shared/types.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { ReadyPanel } from "./ReadyPanel";

vi.mock("@/components/ui/dropdown-menu", () => {
  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
    }) => (
      <button
        type="button"
        role="menuitem"
        onClick={() => onSelect?.()}
        {...props}
      >
        {children}
      </button>
    ),
    DropdownMenuSeparator: () => <hr />,
  };
});

vi.mock("../hooks/useProfile", () => ({
  useProfile: () => ({ personName: "Test" }),
}));

vi.mock("../hooks/useSettings", () => ({
  useSettings: () => ({ showSponsorInfo: false }),
}));

vi.mock("../api", () => ({
  rescoreJob: vi.fn(),
  getResumeProjectsCatalog: vi.fn().mockResolvedValue([]),
  markAsApplied: vi.fn(),
  generateJobPdf: vi.fn(),
  checkSponsor: vi.fn(),
  skipJob: vi.fn(),
  updateJob: vi.fn(),
}));

vi.mock("./JobDetailsEditDrawer", () => ({
  JobDetailsEditDrawer: ({
    open,
    onOpenChange,
    onJobUpdated,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onJobUpdated: () => void | Promise<void>;
  }) =>
    open ? (
      <div data-testid="job-details-edit-drawer">
        <button
          type="button"
          onClick={() => {
            void onJobUpdated();
            onOpenChange(false);
          }}
        >
          Save details
        </button>
      </div>
    ) : null,
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
  outcome: null,
  closedAt: null,
  ...overrides,
});

describe("ReadyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-runs the fit assessment from the menu", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    const job = createJob();
    vi.mocked(api.rescoreJob).mockResolvedValue(job as Job);

    render(
      <MemoryRouter>
        <ReadyPanel
          job={job}
          onJobUpdated={onJobUpdated}
          onJobMoved={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("menuitem", { name: /recalculate match/i }),
    );

    await waitFor(() => expect(api.rescoreJob).toHaveBeenCalledWith("job-1"));
    expect(onJobUpdated).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Match recalculated");
  });

  it("opens edit details drawer from more actions", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    const job = createJob();

    render(
      <MemoryRouter>
        <ReadyPanel
          job={job}
          onJobUpdated={onJobUpdated}
          onJobMoved={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));
    expect(screen.getByTestId("job-details-edit-drawer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save details/i }));
    await waitFor(() => expect(onJobUpdated).toHaveBeenCalled());
    expect(
      screen.queryByTestId("job-details-edit-drawer"),
    ).not.toBeInTheDocument();
  });
});

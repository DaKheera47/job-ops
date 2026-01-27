import { act, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../../shared/types";
import { useSettings } from "../hooks/useSettings";
import { JobHeader } from "./JobHeader";

// Mock useSettings
vi.mock("../hooks/useSettings", () => ({
  useSettings: vi.fn(),
}));

// Mock api
vi.mock("../api", () => ({
  checkSponsor: vi.fn(),
}));

// Mock Tooltip components to simplify testing
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

const mockJob: Job = {
  id: "job-1",
  title: "Software Engineer",
  employer: "Tech Corp",
  location: "London",
  salary: "£60,000",
  deadline: "2025-12-31",
  status: "discovered",
  outcome: null,
  closedAt: null,
  source: "linkedin",
  suitabilityScore: 85,
  suitabilityReason: "Strong match",
  sponsorMatchScore: null,
  sponsorMatchNames: null,
  // Other fields...
} as Job;

describe("JobHeader", () => {
  const renderWithRouter = (ui: React.ReactElement) =>
    render(<MemoryRouter>{ui}</MemoryRouter>);

  beforeEach(() => {
    vi.clearAllMocks();
    (useSettings as any).mockReturnValue({
      showSponsorInfo: true,
    });
  });

  it("renders basic job information", () => {
    renderWithRouter(<JobHeader job={mockJob} />);
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    expect(screen.getByText("London")).toBeInTheDocument();
    expect(screen.getByText("£60,000")).toBeInTheDocument();
  });

  it("links the title and view button to the job page", () => {
    renderWithRouter(<JobHeader job={mockJob} />);

    expect(
      screen.getByRole("link", { name: "Software Engineer" }),
    ).toHaveAttribute("href", "/job/job-1");
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute(
      "href",
      "/job/job-1",
    );
  });

  it("shows 'Check Sponsorship Status' button when sponsorMatchScore is null", async () => {
    const onCheckSponsor = vi.fn().mockResolvedValue(undefined);
    renderWithRouter(
      <JobHeader job={mockJob} onCheckSponsor={onCheckSponsor} />,
    );

    const button = screen.getByText("Check Sponsorship Status");
    expect(button).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(onCheckSponsor).toHaveBeenCalled();
  });

  it("shows 'Confirmed Sponsor' when score >= 95", () => {
    const jobWithSponsor = {
      ...mockJob,
      sponsorMatchScore: 98,
      sponsorMatchNames: '["Tech Corp Ltd"]',
    };
    renderWithRouter(<JobHeader job={jobWithSponsor} />);

    expect(screen.getByText("Confirmed Sponsor")).toBeInTheDocument();
  });

  it("shows 'Potential Sponsor' when score is between 80 and 94", () => {
    const jobWithPotential = {
      ...mockJob,
      sponsorMatchScore: 85,
      sponsorMatchNames: '["Techy Corp"]',
    };
    renderWithRouter(<JobHeader job={jobWithPotential} />);

    expect(screen.getByText("Potential Sponsor")).toBeInTheDocument();
  });

  it("shows 'Sponsor Not Found' when score < 80", () => {
    const jobNoSponsor = {
      ...mockJob,
      sponsorMatchScore: 40,
      sponsorMatchNames: '["Other Corp"]',
    };
    renderWithRouter(<JobHeader job={jobNoSponsor} />);

    expect(screen.getByText("Sponsor Not Found")).toBeInTheDocument();
  });

  it("hides sponsor info when showSponsorInfo is false", () => {
    (useSettings as any).mockReturnValue({
      showSponsorInfo: false,
    });

    const jobWithSponsor = { ...mockJob, sponsorMatchScore: 98 };
    renderWithRouter(<JobHeader job={jobWithSponsor} />);

    expect(screen.queryByText("Confirmed Sponsor")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Check Sponsorship Status"),
    ).not.toBeInTheDocument();
  });

  it("hides the view button when already on a job page", () => {
    render(
      <MemoryRouter initialEntries={["/job/job-1"]}>
        <JobHeader job={mockJob} />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("link", { name: /view/i }),
    ).not.toBeInTheDocument();
  });
});

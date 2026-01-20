import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { OrchestratorPage } from "./OrchestratorPage";
import type { Job } from "../../shared/types";
import type { FilterTab } from "./orchestrator/constants";

const jobFixture: Job = {
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
  updatedAt: "2025-01-02T00:00:00Z",
};

const job2: Job = { ...jobFixture, id: "job-2", status: "discovered" };

const createMatchMedia = (matches: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

vi.mock("./orchestrator/useOrchestratorData", () => ({
  useOrchestratorData: () => ({
    jobs: [jobFixture, job2],
    stats: {
      discovered: 1,
      processing: 0,
      ready: 1,
      applied: 0,
      skipped: 0,
      expired: 0,
    },
    isLoading: false,
    isPipelineRunning: false,
    setIsPipelineRunning: vi.fn(),
    loadJobs: vi.fn(),
  }),
}));

vi.mock("./orchestrator/usePipelineSources", () => ({
  usePipelineSources: () => ({
    pipelineSources: ["linkedin"],
    setPipelineSources: vi.fn(),
    toggleSource: vi.fn(),
  }),
}));

vi.mock("./orchestrator/OrchestratorHeader", () => ({
  OrchestratorHeader: () => <div data-testid="header" />,
}));

vi.mock("./orchestrator/OrchestratorSummary", () => ({
  OrchestratorSummary: () => <div data-testid="summary" />,
}));

vi.mock("./orchestrator/OrchestratorFilters", () => ({
  OrchestratorFilters: ({
    onTabChange,
    onSearchQueryChange,
    onSortChange,
  }: {
    onTabChange: (t: FilterTab) => void;
    onSearchQueryChange: (q: string) => void;
    onSortChange: (s: any) => void;
  }) => (
    <div data-testid="filters">
      <button onClick={() => onTabChange("discovered")}>To Discovered</button>
      <button onClick={() => onSearchQueryChange("test search")}>Set Search</button>
      <button onClick={() => onSortChange({ key: "title", direction: "asc" })}>Set Sort</button>
    </div>
  ),
}));

vi.mock("./orchestrator/JobDetailPanel", () => ({
  JobDetailPanel: () => <div data-testid="detail-panel" />,
}));

vi.mock("./orchestrator/JobListPanel", () => ({
  JobListPanel: ({ onSelectJob, selectedJobId }: { onSelectJob: (id: string) => void; selectedJobId: string | null }) => (
    <div>
      <div data-testid="selected-job">{selectedJobId ?? "none"}</div>
      <button data-testid="select-job-1" type="button" onClick={() => onSelectJob("job-1")}>
        Select job 1
      </button>
      <button data-testid="select-job-2" type="button" onClick={() => onSelectJob("job-2")}>
        Select job 2
      </button>
    </div>
  ),
}));

vi.mock("../components", () => ({
  ManualImportSheet: () => <div data-testid="manual-import" />,
}));

const LocationWatcher = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
};

describe("OrchestratorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs tab selection to the URL", () => {
    window.matchMedia = createMatchMedia(true) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("To Discovered"));
    expect(screen.getByTestId("location").textContent).toContain("/discovered");
  });

  it("syncs job selection to the URL", async () => {
    window.matchMedia = createMatchMedia(true) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/all"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Initial load will auto-select the first matching job (job-1 for all tab)
    const locationText = () => screen.getByTestId("location").textContent;
    expect(locationText()).toContain("/all/job-1");

    // Clicking job-2 should update URL
    const job2Button = screen.getByTestId("select-job-2");
    fireEvent.click(job2Button);

    // Wait for URL to update
    await waitFor(() => {
      expect(locationText()).toContain("/all/job-2");
    });
  });

  it("syncs search query to URL as a parameter", () => {
    window.matchMedia = createMatchMedia(true) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Set Search"));
    expect(screen.getByTestId("location").textContent).toContain("q=test+search");
  });

  it("syncs sorting to URL and removes it when default", () => {
    window.matchMedia = createMatchMedia(true) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Set Sort"));
    expect(screen.getByTestId("location").textContent).toContain("sort=title-asc");
  });

  it("opens the detail drawer on mobile when a job is selected", () => {
    window.matchMedia = createMatchMedia(false) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByTestId("detail-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("select-job-1"));

    expect(screen.getByTestId("detail-panel")).toBeInTheDocument();
  });

  it("renders the detail panel inline on desktop", () => {
    window.matchMedia = createMatchMedia(true) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("detail-panel")).toBeInTheDocument();
  });
});

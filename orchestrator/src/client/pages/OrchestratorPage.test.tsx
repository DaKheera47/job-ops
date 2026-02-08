import type { Job } from "@shared/types.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { OrchestratorPage } from "./OrchestratorPage";
import type { FilterTab } from "./orchestrator/constants";

vi.mock("../api", () => ({
  updateSettings: vi.fn().mockResolvedValue({}),
  runPipeline: vi.fn().mockResolvedValue({ message: "ok" }),
  cancelPipeline: vi.fn().mockResolvedValue({
    message: "Pipeline cancellation requested",
    pipelineRunId: "run-1",
    alreadyRequested: false,
  }),
  getPipelineStatus: vi.fn().mockResolvedValue({
    isRunning: false,
    lastRun: null,
    nextScheduledRun: null,
  }),
}));

let mockIsPipelineRunning = false;
let mockPipelineSources = ["linkedin"] as Array<
  "gradcracker" | "indeed" | "linkedin" | "ukvisajobs"
>;
let mockAutomaticRunValues = {
  topN: 12,
  minSuitabilityScore: 55,
  searchTerms: ["backend"],
  runBudget: 150,
  country: "united kingdom",
};

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
  updatedAt: "2025-01-02T00:00:00Z",
};

const job2: Job = { ...jobFixture, id: "job-2", status: "discovered" };
const processingJob: Job = { ...jobFixture, id: "job-3", status: "processing" };

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
    jobs: [jobFixture, job2, processingJob],
    stats: {
      discovered: 1,
      processing: 1,
      ready: 1,
      applied: 0,
      skipped: 0,
      expired: 0,
    },
    isLoading: false,
    isPipelineRunning: mockIsPipelineRunning,
    setIsPipelineRunning: vi.fn(),
    loadJobs: vi.fn(),
  }),
}));

vi.mock("./orchestrator/usePipelineSources", () => ({
  usePipelineSources: () => ({
    pipelineSources: mockPipelineSources,
    setPipelineSources: vi.fn(),
    toggleSource: vi.fn(),
  }),
}));

vi.mock("../hooks/useSettings", () => ({
  useSettings: () => ({
    settings: {
      jobspySites: ["indeed", "linkedin"],
      ukvisajobsEmail: null,
      ukvisajobsPasswordHint: null,
    },
    refreshSettings: vi.fn(),
  }),
}));

vi.mock("./orchestrator/OrchestratorHeader", () => ({
  OrchestratorHeader: ({
    onCancelPipeline,
  }: {
    onCancelPipeline: () => void;
  }) => (
    <div data-testid="header">
      <button type="button" onClick={onCancelPipeline}>
        Cancel Pipeline
      </button>
    </div>
  ),
}));

vi.mock("./orchestrator/OrchestratorSummary", () => ({
  OrchestratorSummary: () => <div data-testid="summary" />,
}));

vi.mock("./orchestrator/OrchestratorFilters", () => ({
  OrchestratorFilters: ({
    onTabChange,
    onSearchQueryChange,
    onSourceFilterChange,
    onSponsorFilterChange,
    onSalaryFilterChange,
    onResetFilters,
    onSortChange,
    sourcesWithJobs,
    filteredCount,
  }: {
    onTabChange: (t: FilterTab) => void;
    onSearchQueryChange: (q: string) => void;
    onSourceFilterChange: (source: string) => void;
    onSponsorFilterChange: (value: string) => void;
    onSalaryFilterChange: (value: {
      mode: "at_least" | "at_most" | "between";
      min: number | null;
      max: number | null;
    }) => void;
    onResetFilters: () => void;
    onSortChange: (s: any) => void;
    sourcesWithJobs: string[];
    filteredCount: number;
  }) => (
    <div data-testid="filters">
      <div data-testid="sources-with-jobs">{sourcesWithJobs.join(",")}</div>
      <div data-testid="filtered-count">{filteredCount}</div>
      <button type="button" onClick={() => onTabChange("discovered")}>
        To Discovered
      </button>
      <button type="button" onClick={() => onSearchQueryChange("test search")}>
        Set Search
      </button>
      <button
        type="button"
        onClick={() => onSortChange({ key: "title", direction: "asc" })}
      >
        Set Sort
      </button>
      <button type="button" onClick={() => onSourceFilterChange("linkedin")}>
        Set Source
      </button>
      <button type="button" onClick={() => onSponsorFilterChange("confirmed")}>
        Set Sponsor
      </button>
      <button
        type="button"
        onClick={() =>
          onSalaryFilterChange({
            mode: "between",
            min: 60000,
            max: 90000,
          })
        }
      >
        Set Salary Range
      </button>
      <button type="button" onClick={onResetFilters}>
        Reset Filters
      </button>
    </div>
  ),
}));

vi.mock("./orchestrator/JobDetailPanel", () => ({
  JobDetailPanel: () => <div data-testid="detail-panel" />,
}));

vi.mock("./orchestrator/JobListPanel", () => ({
  JobListPanel: ({
    onSelectJob,
    onToggleSelectJob,
    onToggleSelectAll,
    selectedJobId,
  }: {
    onSelectJob: (id: string) => void;
    onToggleSelectJob: (id: string) => void;
    onToggleSelectAll: (checked: boolean) => void;
    selectedJobId: string | null;
  }) => (
    <div>
      <div data-testid="selected-job">{selectedJobId ?? "none"}</div>
      <button
        data-testid="toggle-select-all-on"
        type="button"
        onClick={() => onToggleSelectAll(true)}
      >
        Toggle all on
      </button>
      <button
        data-testid="toggle-select-all-off"
        type="button"
        onClick={() => onToggleSelectAll(false)}
      >
        Toggle all off
      </button>
      <button
        data-testid="toggle-select-job-1"
        type="button"
        onClick={() => onToggleSelectJob("job-1")}
      >
        Toggle job 1
      </button>
      <button
        data-testid="toggle-select-job-3"
        type="button"
        onClick={() => onToggleSelectJob("job-3")}
      >
        Toggle job 3
      </button>
      <button
        data-testid="select-job-1"
        type="button"
        onClick={() => onSelectJob("job-1")}
      >
        Select job 1
      </button>
      <button
        data-testid="select-job-2"
        type="button"
        onClick={() => onSelectJob("job-2")}
      >
        Select job 2
      </button>
      <button
        data-testid="select-job-3"
        type="button"
        onClick={() => onSelectJob("job-3")}
      >
        Select job 3
      </button>
    </div>
  ),
}));

vi.mock("./orchestrator/RunModeModal", () => ({
  RunModeModal: ({
    onSaveAndRunAutomatic,
  }: {
    onSaveAndRunAutomatic: (values: {
      topN: number;
      minSuitabilityScore: number;
      searchTerms: string[];
      runBudget: number;
      country: string;
    }) => Promise<void>;
  }) => (
    <button
      type="button"
      data-testid="run-automatic"
      onClick={() => void onSaveAndRunAutomatic(mockAutomaticRunValues)}
    >
      Run automatic
    </button>
  ),
}));

vi.mock("../components", () => ({
  ManualImportSheet: () => <div data-testid="manual-import" />,
}));

const LocationWatcher = () => {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
};

describe("OrchestratorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPipelineRunning = false;
    mockPipelineSources = ["linkedin"];
    mockAutomaticRunValues = {
      topN: 12,
      minSuitabilityScore: 55,
      searchTerms: ["backend"],
      runBudget: 150,
      country: "united kingdom",
    };
  });

  it("syncs tab selection to the URL", () => {
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("To Discovered"));
    expect(screen.getByTestId("location").textContent).toContain("/discovered");
  });

  it("requests pipeline cancellation when running", async () => {
    mockIsPipelineRunning = true;
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Cancel Pipeline"));

    await waitFor(() => {
      expect(api.cancelPipeline).toHaveBeenCalledTimes(1);
    });
  });

  it("syncs job selection to the URL", async () => {
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/all"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
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
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Set Search"));
    expect(screen.getByTestId("location").textContent).toContain(
      "q=test+search",
    );
  });

  it("syncs sorting to URL and removes it when default", () => {
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Set Sort"));
    expect(screen.getByTestId("location").textContent).toContain(
      "sort=title-asc",
    );
  });

  it("syncs source, sponsor, and salary range filters to URL and resets them", () => {
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Set Source"));
    expect(screen.getByTestId("location").textContent).toContain(
      "source=linkedin",
    );

    fireEvent.click(screen.getByText("Set Sponsor"));
    expect(screen.getByTestId("location").textContent).toContain(
      "sponsor=confirmed",
    );

    fireEvent.click(screen.getByText("Set Salary Range"));
    expect(screen.getByTestId("location").textContent).toContain(
      "salaryMode=between",
    );
    expect(screen.getByTestId("location").textContent).toContain(
      "salaryMin=60000",
    );
    expect(screen.getByTestId("location").textContent).toContain(
      "salaryMax=90000",
    );

    fireEvent.click(screen.getByText("Set Sort"));
    expect(screen.getByTestId("location").textContent).toContain(
      "sort=title-asc",
    );

    fireEvent.click(screen.getByText("Reset Filters"));
    const locationText = screen.getByTestId("location").textContent || "";
    expect(locationText).not.toContain("source=");
    expect(locationText).not.toContain("sponsor=");
    expect(locationText).not.toContain("salaryMode=");
    expect(locationText).not.toContain("salaryMin=");
    expect(locationText).not.toContain("salaryMax=");
    expect(locationText).not.toContain("sort=");
  });

  it("opens the detail drawer on mobile when a job is selected", () => {
    window.matchMedia = createMatchMedia(
      false,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("detail-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("select-job-1"));

    expect(screen.getByTestId("detail-panel")).toBeInTheDocument();
  });

  it("renders the detail panel inline on desktop", () => {
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("detail-panel")).toBeInTheDocument();
  });

  it("clears source filter when no jobs exist for it", async () => {
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/ready?source=ukvisajobs"]}>
        <LocationWatcher />
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).not.toContain(
        "source=ukvisajobs",
      );
    });
  });

  it("saves automatic settings from modal", async () => {
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;
    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockReturnValue(0 as unknown as NodeJS.Timeout);

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("run-automatic"));

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        searchTerms: ["backend"],
        jobspyResultsWanted: 150,
        gradcrackerMaxJobsPerTerm: 150,
        ukvisajobsMaxJobs: 150,
        jobspyCountryIndeed: "united kingdom",
        jobspyLocation: "United Kingdom",
      });
    });
    expect(api.runPipeline).toHaveBeenCalledWith({
      topN: 12,
      minSuitabilityScore: 55,
      sources: ["linkedin"],
    });

    setIntervalSpy.mockRestore();
  });

  it("blocks automatic run when no sources are compatible for selected country", async () => {
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;
    mockPipelineSources = ["gradcracker", "ukvisajobs"];
    mockAutomaticRunValues = {
      topN: 12,
      minSuitabilityScore: 55,
      searchTerms: ["backend"],
      runBudget: 150,
      country: "united states",
    };

    render(
      <MemoryRouter initialEntries={["/ready"]}>
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("run-automatic"));

    await waitFor(() => {
      expect(api.updateSettings).not.toHaveBeenCalled();
      expect(api.runPipeline).not.toHaveBeenCalled();
    });
  });

  it("shows and hides bulk Recalculate match based on selected statuses", async () => {
    window.matchMedia = createMatchMedia(
      true,
    ) as unknown as typeof window.matchMedia;

    render(
      <MemoryRouter initialEntries={["/all"]}>
        <Routes>
          <Route path="/:tab" element={<OrchestratorPage />} />
          <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("toggle-select-all-on"));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Recalculate match" }),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("toggle-select-all-off"));
    fireEvent.click(screen.getByTestId("toggle-select-job-1"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Recalculate match" }),
      ).toBeInTheDocument();
    });
  });
});

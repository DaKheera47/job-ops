import type { NormalizedWorkdayJob } from "@client/api/workday";
import { fetchWorkdayCxsJobs } from "@client/api/workday";
import type { JobListItem } from "@shared/types";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { WatchlistPage } from "./WatchlistPage";

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

vi.mock("@client/api/workday", () => ({
  fetchWorkdayCxsJobs: vi.fn(),
  fetchWorkdayCxsJobDetails: vi.fn(),
  fetchWorkdayLogo: vi.fn(),
}));

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: {
      searchTerms: { value: [] },
      jobspyCountryIndeed: { value: "" },
      searchCities: { value: "" },
      workplaceTypes: { value: [] },
      locationSearchScope: { value: "selected_only" },
      locationMatchStrictness: { value: "exact_only" },
    },
  }),
}));

vi.mock("@client/components/ManualImportSheet", () => ({
  ManualImportSheet: () => null,
}));

vi.mock("@client/components/JobDescriptionPanel", () => ({
  JobDescriptionPanel: () => null,
}));

vi.mock("../api", () => ({
  getJobs: vi.fn(),
  getWatchlistJobStates: vi.fn(),
  getWatchlistSources: vi.fn(),
  recordWatchlistCheck: vi.fn(),
  updateWatchlistSources: vi.fn(),
  ignoreWatchlistJob: vi.fn(),
  unignoreWatchlistJob: vi.fn(),
}));

const autodeskCxsJobsUrl =
  "https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs";

const backendJob: NormalizedWorkdayJob = {
  source: "workday",
  externalId: "26WD97952",
  title: "Backend Engineer",
  company: "Autodesk",
  locationText: "London, United Kingdom",
  postedOn: "2026-05-01",
  jobUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext/job/backend",
  externalPath: "/Ext/job/backend",
  raw: {},
};

const salesJob: NormalizedWorkdayJob = {
  source: "workday",
  externalId: "IGNORED1",
  title: "Sales Manager",
  company: "Autodesk",
  locationText: "Remote",
  postedOn: "2026-05-02",
  jobUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext/job/sales",
  externalPath: "/Ext/job/sales",
  raw: {},
};

function makeWorkspaceJob(overrides: Partial<JobListItem>): JobListItem {
  const now = new Date().toISOString();
  return {
    id: "job-1",
    source: "manual",
    sourceJobId: null,
    title: "Workspace Job",
    employer: "Autodesk",
    jobUrl: "https://example.com/job",
    applicationLink: "https://example.com/job",
    datePosted: null,
    deadline: null,
    salary: null,
    location: null,
    status: "ready",
    outcome: null,
    closedAt: null,
    suitabilityScore: null,
    sponsorMatchScore: null,
    appliedDuplicateMatch: null,
    jobType: null,
    jobFunction: null,
    pdfRegenerating: false,
    pdfFreshness: "missing",
    salaryMinAmount: null,
    salaryMaxAmount: null,
    salaryCurrency: null,
    discoveredAt: now,
    readyAt: now,
    appliedAt: null,
    updatedAt: now,
    ...overrides,
  };
}

function makeJobsResponse(jobs: JobListItem[]) {
  return {
    jobs,
    total: jobs.length,
    byStatus: {
      discovered: 0,
      processing: 0,
      ready: 0,
      applied: 0,
      in_progress: 0,
      skipped: 0,
      expired: 0,
    },
    revision: "r1",
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WatchlistPage />
    </MemoryRouter>,
  );
}

async function openSourceResults(companyLabel: string) {
  const trigger = await screen.findByRole("button", {
    name: new RegExp(`${companyLabel} Careers Page`, "i"),
  });
  fireEvent.click(trigger);
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(api.getJobs).mockResolvedValue(makeJobsResponse([]) as never);
  vi.mocked(api.getWatchlistJobStates).mockResolvedValue({ states: [] });
  vi.mocked(api.recordWatchlistCheck).mockResolvedValue({
    previousLastCheckedAt: null,
    checkedAt: "2026-05-17T00:05:00.000Z",
    jobs: [],
  });
  vi.mocked(api.getWatchlistSources).mockResolvedValue({
    catalogSources: [
      {
        id: `workday:https://autodesk.wd1.myworkdayjobs.com/Ext`,
        label: "Autodesk",
        sourceType: "workday",
        careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
        cxsJobsUrl: autodeskCxsJobsUrl,
      },
      {
        id: `workday:https://pg.wd5.myworkdayjobs.com/en-US/1000`,
        label: "P&G",
        sourceType: "workday",
        careersUrl: "https://pg.wd5.myworkdayjobs.com/en-US/1000",
        cxsJobsUrl: "https://pg.wd5.myworkdayjobs.com/wday/cxs/pg/1000/jobs",
      },
    ],
    selectedSources: [
      {
        id: "selected-autodesk",
        catalogSourceId: `workday:https://autodesk.wd1.myworkdayjobs.com/Ext`,
        label: "Autodesk",
        sourceType: "workday",
        careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
        cxsJobsUrl: autodeskCxsJobsUrl,
        isCustom: false,
        sortOrder: 0,
        createdAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
      },
      {
        id: "selected-pg",
        catalogSourceId: `workday:https://pg.wd5.myworkdayjobs.com/en-US/1000`,
        label: "P&G",
        sourceType: "workday",
        careersUrl: "https://pg.wd5.myworkdayjobs.com/en-US/1000",
        cxsJobsUrl: "https://pg.wd5.myworkdayjobs.com/wday/cxs/pg/1000/jobs",
        isCustom: false,
        sortOrder: 1,
        createdAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
      },
    ],
  });
  vi.mocked(fetchWorkdayCxsJobs).mockImplementation(
    async (careersUrl: string) => {
      if (careersUrl.includes("autodesk")) {
        return {
          careersUrl,
          cxsJobsUrl: autodeskCxsJobsUrl,
          response: {
            total: 2,
            fetched: 2,
            jobs: [backendJob, salesJob],
          },
        };
      }

      return {
        careersUrl,
        cxsJobsUrl: "https://pg.wd5.myworkdayjobs.com/wday/cxs/pg/1000/jobs",
        response: {
          total: 0,
          fetched: 0,
          jobs: [],
        },
      };
    },
  );
});

describe("WatchlistPage", () => {
  it("keeps Save sources disabled until the source draft becomes stale", async () => {
    renderPage();

    await screen.findAllByRole("button", {
      name: /remove watchlist source/i,
    });

    const saveButton = screen.getByRole("button", {
      name: /save sources/i,
    });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /add source/i }));

    expect(screen.getByRole("button", { name: /save sources/i })).toBeEnabled();
  });

  it("shows new rows by default with ignore actions", async () => {
    renderPage();
    await openSourceResults("Autodesk");

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Sales Manager")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Posted" }),
    ).toBeInTheDocument();
    expect(screen.getByText("May 1, 2026")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /more actions/i }),
    ).toHaveLength(2);
  });

  it("hides ignored rows by default and reveals them with unignore", async () => {
    vi.mocked(api.getWatchlistJobStates).mockResolvedValue({
      states: [
        {
          source: "workday:autodesk",
          sourceJobId: "IGNORED1",
          state: "ignored",
          createdAt: "2026-05-17T00:00:00.000Z",
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
    });

    renderPage();
    await openSourceResults("Autodesk");

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Sales Manager")).not.toBeInTheDocument();
    expect(screen.getByText(/1 ignored hidden/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByRole("switch", {
        name: /show ignored watchlist jobs/i,
      })[0],
    );

    expect(await screen.findByText("Sales Manager")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/view signals for sales manager/i),
    ).toBeInTheDocument();
  });

  it("marks jobs that are new since the previous check", async () => {
    vi.mocked(api.recordWatchlistCheck).mockResolvedValue({
      previousLastCheckedAt: "2026-05-16T12:00:00.000Z",
      checkedAt: "2026-05-17T00:05:00.000Z",
      jobs: [
        {
          source: "workday:autodesk",
          sourceJobId: "26WD97952",
          isNewSinceLastCheck: true,
          firstSeenAt: "2026-05-17T00:05:00.000Z",
          lastSeenAt: "2026-05-17T00:05:00.000Z",
        },
        {
          source: "workday:autodesk",
          sourceJobId: "IGNORED1",
          isNewSinceLastCheck: false,
          firstSeenAt: "2026-05-16T11:00:00.000Z",
          lastSeenAt: "2026-05-17T00:05:00.000Z",
        },
      ],
    });

    renderPage();
    await openSourceResults("Autodesk");

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/1 new since/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/view signals for backend engineer/i),
    ).toBeInTheDocument();
  });

  it("shows moved rows as already in workspace even when ignored", async () => {
    vi.mocked(api.getJobs).mockResolvedValue(
      makeJobsResponse([
        makeWorkspaceJob({
          id: "job-ignored",
          source: "workday:autodesk",
          sourceJobId: "IGNORED1",
          title: "Sales Manager",
          jobUrl: salesJob.jobUrl,
          applicationLink: salesJob.jobUrl,
        }),
      ]) as never,
    );
    vi.mocked(api.getWatchlistJobStates).mockResolvedValue({
      states: [
        {
          source: "workday:autodesk",
          sourceJobId: "IGNORED1",
          state: "ignored",
          createdAt: "2026-05-17T00:00:00.000Z",
          updatedAt: "2026-05-17T00:00:00.000Z",
        },
      ],
    });

    renderPage();
    await openSourceResults("Autodesk");

    expect(await screen.findByText("Sales Manager")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/view signals for sales manager/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Ignored")).not.toBeInTheDocument();
    });
  });

  it("disables Save sources again after persisting the draft", async () => {
    renderPage();

    const removeButtons = await screen.findAllByRole("button", {
      name: /remove watchlist source/i,
    });
    const secondRemoveButton = removeButtons[1];
    expect(secondRemoveButton).toBeDefined();
    if (!secondRemoveButton) {
      throw new Error("Expected a second remove button");
    }
    fireEvent.click(secondRemoveButton);

    const saveButton = screen.getByRole("button", { name: /save sources/i });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateWatchlistSources).toHaveBeenCalledTimes(1);
      expect(vi.mocked(api.updateWatchlistSources).mock.calls[0]?.[0]).toEqual({
        selections: [
          {
            catalogSourceId: `workday:https://autodesk.wd1.myworkdayjobs.com/Ext`,
            sourceType: "workday",
            label: "Autodesk",
            careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
          },
        ],
      });
      expect(
        screen.getByRole("button", { name: /save sources/i }),
      ).toBeDisabled();
    });
  });
});

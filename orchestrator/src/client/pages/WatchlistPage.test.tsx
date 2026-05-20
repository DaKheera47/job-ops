import type { JobListItem, WatchlistJobResult } from "@shared/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { WatchlistPage } from "./WatchlistPage";

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

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
  fetchWatchlistResults: vi.fn(),
  fetchWatchlistJobDetails: vi.fn(),
  prepareWatchlistImportDraft: vi.fn(),
  fetchWatchlistSourceBranding: vi.fn(),
  updateWatchlistSources: vi.fn(),
  ignoreWatchlistJob: vi.fn(),
  unignoreWatchlistJob: vi.fn(),
}));

const autodeskCxsJobsUrl =
  "https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs";

const workdaySourceType = {
  sourceType: "workday" as const,
  label: "Workday",
  catalogLabel: "Workday company",
  customSourceOptionLabel: "Choose your own Workday URL",
  customSourceSearchText: "custom workday url",
  customSourceInputLabel: "Custom Workday URL",
  customSourcePlaceholder: "https://company.wd1.myworkdayjobs.com/...",
  customSourceHelpText: "Use the public Workday careers URL.",
  emptyCatalogText: "No Workday companies found.",
  fetchingLabel: "Fetching from Workday...",
  invalidUrlMessage: "Invalid Workday URL",
  supportsCustomSource: true,
  supportsBranding: true,
};

const bamboohrSourceType = {
  sourceType: "bamboohr" as const,
  label: "BambooHR",
  catalogLabel: "BambooHR company",
  customSourceOptionLabel: "Choose your own BambooHR URL",
  customSourceSearchText: "custom bamboohr url",
  customSourceInputLabel: "Custom BambooHR URL",
  customSourcePlaceholder: "https://company.bamboohr.com/careers",
  customSourceHelpText: "Use the public BambooHR careers URL.",
  emptyCatalogText: "No BambooHR companies found.",
  fetchingLabel: "Fetching from BambooHR...",
  invalidUrlMessage: "Invalid BambooHR URL",
  supportsCustomSource: true,
  supportsBranding: true,
};

const backendJob: WatchlistJobResult = {
  jobRef: "https://autodesk.wd1.myworkdayjobs.com/Ext/job/backend",
  source: "workday:autodesk",
  sourceJobId: "26WD97952",
  sourceType: "workday",
  title: "Backend Engineer",
  employer: "Autodesk",
  location: "London, United Kingdom",
  postedAt: "2026-05-01",
  jobUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext/job/backend",
  applicationLink: "https://autodesk.wd1.myworkdayjobs.com/Ext/job/backend",
  rowState: "new",
  isNewSinceLastCheck: false,
  workspaceJob: null,
};

const salesJob: WatchlistJobResult = {
  jobRef: "https://autodesk.wd1.myworkdayjobs.com/Ext/job/sales",
  source: "workday:autodesk",
  sourceJobId: "IGNORED1",
  sourceType: "workday",
  title: "Sales Manager",
  employer: "Autodesk",
  location: "Remote",
  postedAt: "2026-05-02",
  jobUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext/job/sales",
  applicationLink: "https://autodesk.wd1.myworkdayjobs.com/Ext/job/sales",
  rowState: "new",
  isNewSinceLastCheck: false,
  workspaceJob: null,
};

let watchlistSourcesState: Awaited<ReturnType<typeof api.getWatchlistSources>>;

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

function makeWatchlistResults(
  jobs: WatchlistJobResult[] = [backendJob, salesJob],
) {
  return {
    checkedAt: "2026-05-17T00:05:00.000Z",
    previousLastCheckedAt: null,
    sources: watchlistSourcesState.selectedSources.map((source, index) => {
      const sourceJobs = index === 0 ? jobs : [];
      return {
        status: "success" as const,
        source,
        jobs: sourceJobs,
        total: sourceJobs.length,
        fetched: sourceJobs.length,
      };
    }),
  };
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
  watchlistSourcesState = {
    catalogSources: [
      {
        id: "autodesk-workday",
        label: "Autodesk",
        sourceType: "workday",
        careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
        cxsJobsUrl: autodeskCxsJobsUrl,
      },
      {
        id: "pg-workday",
        label: "P&G",
        sourceType: "workday",
        careersUrl: "https://pg.wd5.myworkdayjobs.com/en-US/1000",
        cxsJobsUrl: "https://pg.wd5.myworkdayjobs.com/wday/cxs/pg/1000/jobs",
      },
    ],
    selectedSources: [
      {
        id: "selected-autodesk",
        catalogSourceId: "autodesk-workday",
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
        catalogSourceId: "pg-workday",
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
    availableSourceTypes: [workdaySourceType, bamboohrSourceType],
  };
  vi.mocked(api.getWatchlistSources).mockImplementation(
    async () => watchlistSourcesState,
  );
  vi.mocked(api.fetchWatchlistResults).mockImplementation(async () =>
    makeWatchlistResults(),
  );
  vi.mocked(api.fetchWatchlistSourceBranding).mockRejectedValue(
    new Error("No logo in test"),
  );
  vi.mocked(api.updateWatchlistSources).mockImplementation(async (input) => {
    watchlistSourcesState = {
      ...watchlistSourcesState,
      selectedSources: input.selections.map((selection, index) => ({
        id: `selected-${index}`,
        catalogSourceId: selection.catalogSourceId ?? null,
        label: selection.label ?? selection.careersUrl,
        sourceType: selection.sourceType,
        careersUrl: selection.careersUrl,
        cxsJobsUrl:
          selection.sourceType === "workday"
            ? selection.careersUrl.includes("autodesk")
              ? autodeskCxsJobsUrl
              : null
            : null,
        isCustom: selection.catalogSourceId === null,
        sortOrder: index,
        createdAt: "2026-05-17T00:00:00.000Z",
        updatedAt: "2026-05-17T00:00:00.000Z",
      })),
    };

    return watchlistSourcesState;
  });
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
    vi.mocked(api.fetchWatchlistResults).mockImplementation(async () =>
      makeWatchlistResults([
        { ...backendJob },
        { ...salesJob, rowState: "ignored" },
      ]),
    );

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
    vi.mocked(api.fetchWatchlistResults).mockResolvedValue({
      previousLastCheckedAt: "2026-05-16T12:00:00.000Z",
      checkedAt: "2026-05-17T00:05:00.000Z",
      sources: [
        {
          status: "success",
          source: watchlistSourcesState.selectedSources[0],
          jobs: [{ ...backendJob, isNewSinceLastCheck: true }, salesJob],
          total: 2,
          fetched: 2,
        },
        {
          status: "success",
          source: watchlistSourcesState.selectedSources[1],
          jobs: [],
          total: 0,
          fetched: 0,
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

  it("shows a friendly inline alert for source fetch failures", async () => {
    vi.mocked(api.fetchWatchlistResults).mockResolvedValue({
      checkedAt: "2026-05-17T00:05:00.000Z",
      previousLastCheckedAt: null,
      sources: [
        {
          status: "error",
          source: watchlistSourcesState.selectedSources[0],
          error: "fetch failed",
        },
        {
          status: "success",
          source: watchlistSourcesState.selectedSources[1],
          jobs: [],
          total: 0,
          fetched: 0,
        },
      ],
    });

    renderPage();
    await openSourceResults("Autodesk");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load jobs");
    expect(alert).toHaveTextContent("fetch failed");
    expect(alert).toHaveTextContent(
      "This source failed to load, but the rest of your watchlist can still be checked.",
    );

    const details = within(alert).getByText("Technical details");
    const diagnostics = within(alert).getByText(/"label": "Autodesk"/i);

    expect(details).toBeInTheDocument();
    expect(diagnostics).not.toBeVisible();

    fireEvent.click(details);

    expect(diagnostics).toBeVisible();
    expect(within(alert).getByText(/"error": "fetch failed"/i)).toBeVisible();
  });

  it("shows moved rows as already in workspace even when ignored", async () => {
    vi.mocked(api.fetchWatchlistResults).mockImplementation(async () =>
      makeWatchlistResults([
        backendJob,
        {
          ...salesJob,
          rowState: "moved_to_workspace",
          workspaceJob: { id: "job-ignored", status: "ready" },
        },
      ]),
    );

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
            catalogSourceId: "autodesk-workday",
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

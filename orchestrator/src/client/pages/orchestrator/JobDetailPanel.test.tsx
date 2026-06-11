import * as api from "@client/api";
import * as privatePdf from "@client/lib/private-pdf";
import { renderWithQueryClient } from "@client/test/renderWithQueryClient";
import { createAppSettings, createJob } from "@shared/testing/factories.js";
import type { AppSettings, Job } from "@shared/types.js";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobDetailPanel } from "./JobDetailPanel";

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

const mockSettings = {
  settings: null as AppSettings | null,
  error: null,
  isLoading: false,
  showSponsorInfo: true,
  renderMarkdownInJobDescriptions: true,
  refreshSettings: vi.fn(),
};

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

vi.mock("@client/components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@client/components")>();
  return {
    ...actual,
    JobHeader: ({ jobCTA }: { jobCTA?: React.ReactNode }) => (
      <div data-testid="job-header">{jobCTA}</div>
    ),
    JobBriefPane: () => <div data-testid="job-brief-pane" />,
    TailoredSummary: () => <div data-testid="tailored-summary" />,
  };
});

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: () => mockSettings,
}));

vi.mock("@client/components/tailoring/TailoringWorkspace", () => ({
  TailoringWorkspace: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (isDirty: boolean) => void;
  }) => (
    <div data-testid="tailoring-workspace">
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        Mark tailoring dirty
      </button>
      <button type="button" onClick={() => onDirtyChange?.(false)}>
        Mark tailoring clean
      </button>
    </div>
  ),
}));

vi.mock("@client/components/JobDetailsEditDrawer", () => ({
  JobDetailsEditDrawer: ({
    open,
    onOpenChange,
    onJobUpdated,
    job,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onJobUpdated: () => Promise<void>;
    job: Job | null;
  }) =>
    open ? (
      <div data-testid="job-details-edit-drawer">
        <div>{job?.id}</div>
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

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    ...actual,
    copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
    formatJobForWebhook: vi.fn(() => "payload"),
  };
});

vi.mock("@client/api", () => ({
  updateJob: vi.fn(),
  processJob: vi.fn(),
  generateJobPdf: vi.fn(),
  markAsApplied: vi.fn(),
  skipJob: vi.fn(),
  getProfile: vi.fn().mockResolvedValue({}),
  getResumeProjectsCatalog: vi.fn().mockResolvedValue([]),
}));

vi.mock("@client/lib/private-pdf", () => ({
  downloadJobPdf: vi.fn().mockResolvedValue(undefined),
  openJobPdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

const renderJobDetailPanel = async (
  props: React.ComponentProps<typeof JobDetailPanel>,
) => {
  const rendered = render(<JobDetailPanel {...props} />);
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
};

const getApplyPanel = () => screen.getByRole("tabpanel", { name: /apply/i });

describe("JobDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings.settings = null;
    mockSettings.renderMarkdownInJobDescriptions = true;
    vi.mocked(api.getProfile).mockResolvedValue({});
  });

  it("renders discovered jobs in the unified inspector", async () => {
    const job = createJob({ id: "job-99", status: "discovered" });

    await renderJobDetailPanel({
      activeTab: "discovered",
      activeJobs: [job],
      selectedJob: job,
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    expect(screen.getByText("Start Tailoring")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Base description extracted from the job listing, editable if something looks off. Used by the Ghostwriter and for fit assessment.",
      ),
    ).toBeInTheDocument();
  });

  it("shows stale PDF copy and old-PDF actions in the application kit", async () => {
    const job = createJob({
      status: "ready",
      pdfPath: "data/pdfs/job-1.pdf",
      pdfSource: "generated",
      pdfFreshness: "stale",
    });

    await renderJobDetailPanel({
      activeTab: "ready",
      activeJobs: [job],
      selectedJob: job,
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    fireEvent.click(screen.getByRole("tab", { name: /apply/i }));

    expect(
      screen.getByText(
        "PDF is out of date. A new one will regenerate automatically.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /download old pdf/i }),
    ).toBeEnabled();
    expect(
      within(getApplyPanel()).queryByRole("button", { name: /view old pdf/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /view old pdf/i }),
    ).toBeEnabled();
  });

  it("promotes Mark Applied after the ready job listing is opened", async () => {
    const job = createJob({
      status: "ready",
      jobUrl: "https://example.com/apply",
      applicationLink: null,
    });

    await renderJobDetailPanel({
      activeTab: "ready",
      activeJobs: [job],
      selectedJob: job,
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    const applyPanel = within(getApplyPanel());
    const openListing = applyPanel.getByRole("link", {
      name: /open job listing/i,
    });
    const markApplied = applyPanel.getByRole("button", {
      name: /mark applied/i,
    });

    expect(openListing).toHaveClass("bg-emerald-600");
    expect(markApplied).not.toHaveClass("bg-emerald-600");

    fireEvent.click(openListing);

    expect(openListing).not.toHaveClass("bg-emerald-600");
    expect(markApplied).toHaveClass("bg-emerald-600");
  });

  it("downloads PDFs with language-aware German transliteration", async () => {
    mockSettings.settings = createAppSettings({
      chatStyleLanguageMode: {
        value: "manual",
        default: "manual",
        override: null,
      },
      chatStyleManualLanguage: {
        value: "german",
        default: "english",
        override: null,
      },
    });
    vi.mocked(api.getProfile).mockResolvedValue({
      basics: {
        name: "Müller",
      },
    });
    const job = createJob({
      id: "job-1",
      employer: "Büro Straße",
      pdfPath: "data/pdfs/job-1.pdf",
      status: "ready",
    });

    await renderJobDetailPanel({
      activeTab: "ready",
      activeJobs: [job],
      selectedJob: job,
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    await waitFor(() =>
      expect(privatePdf.downloadJobPdf).toHaveBeenCalledWith(
        "job-1",
        "Mueller_Buero_Strasse.pdf",
      ),
    );
  });

  it("disables application-kit PDF actions while regeneration is active", async () => {
    const job = createJob({
      status: "ready",
      pdfPath: "data/pdfs/job-1.pdf",
      pdfSource: "generated",
      pdfRegenerating: true,
      pdfFreshness: "regenerating",
    });

    await renderJobDetailPanel({
      activeTab: "ready",
      activeJobs: [job],
      selectedJob: job,
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    fireEvent.click(screen.getByRole("tab", { name: /apply/i }));

    expect(
      screen.getByRole("button", { name: /download pdf/i }),
    ).toBeDisabled();
    expect(
      within(getApplyPanel()).queryByRole("button", { name: /view pdf/i }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state when no job is selected", async () => {
    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: null,
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    expect(screen.getByText("No job selected")).toBeInTheDocument();
  });

  it("renders a stripped description preview for html content", async () => {
    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({
        status: "applied",
        jobDescription: "<p>Hello <strong>world</strong></p>",
      }),
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === "P" && node.textContent === "Hello world",
      ),
    ).toBeInTheDocument();
  });

  it("renders markdown in the brief job description when enabled", async () => {
    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({
        status: "applied",
        jobDescription: "# Responsibilities\n\n- Build APIs",
      }),
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    expect(
      screen.getByRole("heading", { name: "Responsibilities" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("# Responsibilities")).not.toBeInTheDocument();
  });

  it("shows a view job link in the job description actions", async () => {
    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({
        status: "applied",
        jobUrl: "https://example.com/jobs/source-listing",
        applicationLink: "https://example.com/apply/company",
      }),
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    const viewJobLink = screen.getByRole("link", { name: /view job/i });

    expect(viewJobLink).toHaveAttribute(
      "href",
      "https://example.com/jobs/source-listing",
    );
    expect(viewJobLink).toHaveAttribute("target", "_blank");
    expect(viewJobLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders raw markdown in the brief job description when disabled", async () => {
    mockSettings.renderMarkdownInJobDescriptions = false;

    const rendered = await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({
        status: "applied",
        jobDescription: "# Responsibilities\n\n- Build APIs",
      }),
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
    });

    const rawDescription = rendered.container.querySelector(
      "div.whitespace-pre-wrap",
    );
    expect(rawDescription?.textContent).toBe(
      "# Responsibilities\n\n- Build APIs",
    );
    expect(
      screen.queryByRole("heading", { name: "Responsibilities" }),
    ).not.toBeInTheDocument();
  });

  it("saves an edited description", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.updateJob).mockResolvedValue(undefined as any);

    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({ status: "applied", jobDescription: "Original" }),
      onSelectJobId: vi.fn(),
      onJobUpdated,
    });

    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));

    fireEvent.change(screen.getByPlaceholderText("Enter job description..."), {
      target: { value: "Updated description" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(api.updateJob).toHaveBeenCalledWith("job-1", {
        jobDescription: "Updated description",
      }),
    );
    expect(onJobUpdated).toHaveBeenCalled();
  });

  it("opens edit details drawer from menu and saves", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);

    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({ jobDescription: "Original" }),
      onSelectJobId: vi.fn(),
      onJobUpdated,
    });

    fireEvent.click(screen.getByRole("menuitem", { name: /edit details/i }));
    expect(
      await screen.findByTestId("job-details-edit-drawer"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(onJobUpdated).toHaveBeenCalled());
    expect(
      screen.queryByTestId("job-details-edit-drawer"),
    ).not.toBeInTheDocument();
  });

  it("marks a job as applied from the action button", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.markAsApplied).mockResolvedValue(undefined as any);

    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({ status: "ready" }),
      onSelectJobId: vi.fn(),
      onJobUpdated,
    });

    fireEvent.click(
      within(getApplyPanel()).getByRole("button", { name: /mark applied/i }),
    );

    await waitFor(() =>
      expect(api.markAsApplied).toHaveBeenCalledWith("job-1"),
    );
    expect(onJobUpdated).toHaveBeenCalled();
  });

  it("moves an applied job to in progress from the action button", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.updateJob).mockResolvedValue(undefined as any);

    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({ status: "applied" }),
      onSelectJobId: vi.fn(),
      onJobUpdated,
    });

    fireEvent.click(
      screen.getByRole("button", { name: /move to in progress/i }),
    );

    await waitFor(() =>
      expect(api.updateJob).toHaveBeenCalledWith("job-1", {
        status: "in_progress",
      }),
    );
    expect(onJobUpdated).toHaveBeenCalled();
  });

  it("skips a job from the menu", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    vi.mocked(api.skipJob).mockResolvedValue(undefined as any);

    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({ status: "ready" }),
      onSelectJobId: vi.fn(),
      onJobUpdated,
    });

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /more actions/i }),
    );
    const skipItem = await screen.findByRole("menuitem", { name: /skip job/i });
    fireEvent.click(skipItem);

    await waitFor(() => expect(api.skipJob).toHaveBeenCalledWith("job-1"));
    expect(onJobUpdated).toHaveBeenCalled();
  });

  it("forwards tailoring dirty state to refresh pause callback", async () => {
    const onPauseRefreshChange = vi.fn();

    await renderJobDetailPanel({
      activeTab: "all",
      activeJobs: [],
      selectedJob: createJob({ status: "ready" }),
      onSelectJobId: vi.fn(),
      onJobUpdated: vi.fn().mockResolvedValue(undefined),
      onPauseRefreshChange,
    });

    fireEvent.mouseDown(screen.getByRole("tab", { name: /tailoring/i }));
    fireEvent.click(await screen.findByText("Mark tailoring dirty"));
    fireEvent.click(screen.getByText("Mark tailoring clean"));

    expect(onPauseRefreshChange).toHaveBeenCalledWith(true);
    expect(onPauseRefreshChange).toHaveBeenCalledWith(false);
  });
});

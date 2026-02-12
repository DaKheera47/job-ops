import type {
  Job,
  JobListItem,
  PostApplicationInboxItem,
  PostApplicationProviderActionResponse,
  PostApplicationSyncRun,
} from "@shared/types";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { TrackingInboxPage } from "./TrackingInboxPage";

vi.mock("../api", () => ({
  postApplicationProviderStatus: vi.fn(),
  postApplicationProviderConnect: vi.fn(),
  postApplicationGmailOauthStart: vi.fn(),
  postApplicationGmailOauthExchange: vi.fn(),
  postApplicationProviderSync: vi.fn(),
  postApplicationProviderDisconnect: vi.fn(),
  getJobs: vi.fn(),
  getPostApplicationInbox: vi.fn(),
  getPostApplicationRuns: vi.fn(),
  getPostApplicationRunMessages: vi.fn(),
  approvePostApplicationInboxItem: vi.fn(),
  denyPostApplicationInboxItem: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function makeStatusResponse(
  overrides?: Partial<PostApplicationProviderActionResponse>,
): PostApplicationProviderActionResponse {
  return {
    provider: "gmail",
    action: "status",
    accountKey: "default",
    status: {
      provider: "gmail",
      accountKey: "default",
      connected: true,
      integration: {
        id: "integration-1",
        provider: "gmail",
        accountKey: "default",
        displayName: "Primary",
        status: "connected",
        credentials: null,
        lastConnectedAt: Date.now(),
        lastSyncedAt: Date.now(),
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    ...overrides,
  };
}

function makeInboxItem(
  overrides?: Partial<PostApplicationInboxItem>,
): PostApplicationInboxItem {
  return {
    message: {
      id: "message-1",
      provider: "gmail",
      accountKey: "default",
      integrationId: "integration-1",
      syncRunId: "run-1",
      externalMessageId: "external-1",
      externalThreadId: null,
      fromAddress: "roku@smartrecruiters.com",
      fromDomain: "smartrecruiters.com",
      senderName: "Roku",
      subject: "Thanks for applying to Roku",
      receivedAt: Date.now(),
      snippet:
        "We received your application for Front End JavaScript Developer",
      classificationLabel: "Application confirmation",
      classificationConfidence: 0.96,
      classificationPayload: { companyName: "Roku" },
      relevanceKeywordScore: 97,
      relevanceLlmScore: null,
      relevanceFinalScore: 97,
      relevanceDecision: "relevant",
      reviewStatus: "pending_review",
      matchedJobId: "job-1",
      decidedAt: null,
      decidedBy: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    candidates: [
      {
        id: "candidate-1",
        messageId: "message-1",
        jobId: "job-1",
        score: 97,
        rank: 1,
        reasons: ["company:40", "title:30"],
        matchMethod: "keyword",
        isHighConfidence: true,
        createdAt: new Date().toISOString(),
      },
    ],
    link: null,
    ...overrides,
  };
}

function makeRun(): PostApplicationSyncRun {
  const now = Date.now();
  return {
    id: "run-1",
    provider: "gmail",
    accountKey: "default",
    integrationId: "integration-1",
    status: "completed",
    startedAt: now,
    completedAt: now,
    messagesDiscovered: 10,
    messagesRelevant: 7,
    messagesClassified: 7,
    messagesMatched: 5,
    messagesApproved: 2,
    messagesDenied: 1,
    messagesErrored: 0,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeAppliedJob(overrides?: Partial<JobListItem>): JobListItem {
  return {
    id: "job-applied-1",
    source: "linkedin",
    title: "Frontend Engineer",
    employer: "Roku",
    jobUrl: "https://example.com/jobs/job-applied-1",
    applicationLink: "https://example.com/apply/job-applied-1",
    datePosted: "2026-02-01",
    deadline: null,
    salary: null,
    location: "London",
    status: "applied",
    suitabilityScore: 88,
    sponsorMatchScore: null,
    jobType: null,
    jobFunction: null,
    salaryMinAmount: null,
    salaryMaxAmount: null,
    salaryCurrency: null,
    discoveredAt: new Date().toISOString(),
    appliedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAppliedJobsResponse(
  jobs: JobListItem[],
): Awaited<ReturnType<typeof api.getJobs>> {
  return {
    jobs,
    total: jobs.length,
    byStatus: {
      discovered: 0,
      processing: 0,
      ready: 0,
      applied: jobs.length,
      skipped: 0,
      expired: 0,
    },
    revision: `rev-${jobs.length}`,
  } as unknown as {
    jobs: Job[];
    total: number;
    byStatus: Record<Job["status"], number>;
    revision: string;
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/tracking-inbox"]}>
      <TrackingInboxPage />
    </MemoryRouter>,
  );
}

describe("TrackingInboxPage", () => {
  beforeEach(() => {
    vi.mocked(api.postApplicationProviderStatus).mockResolvedValue(
      makeStatusResponse(),
    );
    vi.mocked(api.getPostApplicationRuns).mockResolvedValue({
      runs: [makeRun()],
      total: 1,
    });
    vi.mocked(api.getPostApplicationRunMessages).mockResolvedValue({
      run: makeRun(),
      items: [makeInboxItem()],
      total: 1,
    });
    vi.mocked(api.postApplicationProviderConnect).mockResolvedValue(
      makeStatusResponse({ action: "connect" }),
    );
    vi.mocked(api.postApplicationGmailOauthStart).mockResolvedValue({
      provider: "gmail",
      accountKey: "default",
      authorizationUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?state=test-state",
      state: "test-state",
    });
    vi.mocked(api.postApplicationGmailOauthExchange).mockResolvedValue(
      makeStatusResponse({ action: "connect" }),
    );
    vi.mocked(api.postApplicationProviderSync).mockResolvedValue(
      makeStatusResponse({ action: "sync" }),
    );
    vi.mocked(api.postApplicationProviderDisconnect).mockResolvedValue(
      makeStatusResponse({ action: "disconnect" }),
    );
    vi.mocked(api.getJobs).mockResolvedValue(
      makeAppliedJobsResponse([makeAppliedJob()]),
    );
    vi.mocked(api.approvePostApplicationInboxItem).mockResolvedValue({
      message: makeInboxItem().message,
      stageEventId: "stage-1",
    });
    vi.mocked(api.denyPostApplicationInboxItem).mockResolvedValue({
      message: {
        ...makeInboxItem().message,
        reviewStatus: "denied",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("renders empty state on initial load with provider controls", async () => {
    vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
      items: [],
      total: 0,
    });

    renderPage();

    await screen.findByText("Tracking Inbox");
    await screen.findByText("No pending messages");

    expect(screen.getByText("Provider Controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect" }),
    ).not.toBeInTheDocument();
  });

  it("shows connect button and hides disconnect when disconnected", async () => {
    vi.mocked(api.postApplicationProviderStatus).mockResolvedValue(
      makeStatusResponse({
        status: {
          provider: "gmail",
          accountKey: "default",
          connected: false,
          integration: null,
        },
      }),
    );
    vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
      items: [],
      total: 0,
    });

    renderPage();

    await screen.findByText("Provider Controls");
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disconnect" }),
    ).not.toBeInTheDocument();
  });

  it("approves a message and refreshes queue", async () => {
    vi.mocked(api.getPostApplicationInbox)
      .mockResolvedValueOnce({ items: [makeInboxItem()], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    renderPage();

    await screen.findByText(/thanks for applying to roku/i);

    fireEvent.click(
      screen.getByRole("button", { name: "Agree with suggested job match" }),
    );

    await waitFor(() => {
      expect(api.approvePostApplicationInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: "message-1",
          jobId: "job-1",
        }),
      );
    });

    await screen.findByText("No pending messages");
  });

  it("denies a message and refreshes queue", async () => {
    vi.mocked(api.getPostApplicationInbox)
      .mockResolvedValueOnce({ items: [makeInboxItem()], total: 1 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    renderPage();

    await screen.findByText(/thanks for applying to roku/i);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Disagree with suggested job match",
      }),
    );

    await waitFor(() => {
      expect(api.denyPostApplicationInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: "message-1",
          jobId: "job-1",
        }),
      );
    });

    await screen.findByText("No pending messages");
  });

  it("shows error toast when refresh fails", async () => {
    vi.mocked(api.getPostApplicationInbox).mockRejectedValue(
      new Error("inbox failed"),
    );

    renderPage();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("inbox failed"),
      );
    });
  });

  it("connects Gmail via OAuth popup flow", async () => {
    vi.mocked(api.postApplicationProviderStatus).mockResolvedValue(
      makeStatusResponse({
        status: {
          provider: "gmail",
          accountKey: "default",
          connected: false,
          integration: null,
        },
      }),
    );
    vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
      items: [],
      total: 0,
    });
    const popup = {
      closed: false,
      close: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);

    renderPage();
    await screen.findByText("Provider Controls");

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(api.postApplicationGmailOauthStart).toHaveBeenCalledWith({
        accountKey: "default",
      });
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          type: "gmail-oauth-result",
          state: "test-state",
          code: "oauth-code",
        },
      }),
    );

    await waitFor(() => {
      expect(api.postApplicationGmailOauthExchange).toHaveBeenCalledWith({
        accountKey: "default",
        state: "test-state",
        code: "oauth-code",
      });
    });
  });

  it("opens run messages modal from recent sync run", async () => {
    vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
      items: [makeInboxItem()],
      total: 1,
    });

    renderPage();
    await screen.findByText("Recent Sync Runs");

    fireEvent.click(screen.getByRole("button", { name: /run-1/i }));

    await waitFor(() => {
      expect(api.getPostApplicationRunMessages).toHaveBeenCalledWith({
        runId: "run-1",
        provider: "gmail",
        accountKey: "default",
      });
    });

    await screen.findByRole("dialog");
    expect(screen.getByText("Run Messages")).toBeInTheDocument();
  });

  it("re-primes candidate selection for run messages when cached candidate id is stale", async () => {
    const inboxItem = makeInboxItem();
    const runItem = makeInboxItem({
      candidates: [
        {
          ...inboxItem.candidates[0],
          id: "candidate-2",
        },
      ],
    });

    vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
      items: [inboxItem],
      total: 1,
    });
    vi.mocked(api.getPostApplicationRunMessages).mockResolvedValue({
      run: makeRun(),
      items: [runItem],
      total: 1,
    });

    renderPage();
    await screen.findByText("Recent Sync Runs");

    fireEvent.click(screen.getByRole("button", { name: /run-1/i }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Agree with suggested job match",
      }),
    );

    await waitFor(() => {
      expect(api.approvePostApplicationInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: "message-1",
          jobId: "job-1",
        }),
      );
    });
  });

  it("uses applied-job fallback when approving a zero-candidate queue message", async () => {
    vi.mocked(api.getPostApplicationInbox)
      .mockResolvedValueOnce({
        items: [makeInboxItem({ candidates: [] })],
        total: 1,
      })
      .mockResolvedValueOnce({ items: [], total: 0 });
    vi.mocked(api.getJobs).mockResolvedValue(
      makeAppliedJobsResponse([makeAppliedJob({ id: "job-applied-fallback" })]),
    );

    renderPage();
    await screen.findByText(/thanks for applying to roku/i);

    await waitFor(() => {
      expect(api.getJobs).toHaveBeenCalledWith({
        view: "list",
      });
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Agree with suggested job match" }),
    );

    await waitFor(() => {
      expect(api.approvePostApplicationInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: "message-1",
          jobId: "job-applied-fallback",
        }),
      );
    });
  });

  it("allows approving no_reliable_match messages with applied-job fallback", async () => {
    vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
      items: [
        makeInboxItem({
          message: {
            ...makeInboxItem().message,
            reviewStatus: "no_reliable_match",
          },
          candidates: [],
        }),
      ],
      total: 1,
    });
    vi.mocked(api.getJobs).mockResolvedValue(
      makeAppliedJobsResponse([makeAppliedJob({ id: "job-manual-1" })]),
    );

    renderPage();
    await screen.findByText(/thanks for applying to roku/i);

    fireEvent.click(
      screen.getByRole("button", { name: "Agree with suggested job match" }),
    );

    await waitFor(() => {
      expect(api.approvePostApplicationInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: "message-1",
          jobId: "job-manual-1",
        }),
      );
    });
  });

  it("uses applied-job fallback when approving a zero-candidate run message", async () => {
    vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
      items: [makeInboxItem()],
      total: 1,
    });
    vi.mocked(api.getPostApplicationRunMessages).mockResolvedValue({
      run: makeRun(),
      items: [makeInboxItem({ candidates: [] })],
      total: 1,
    });
    vi.mocked(api.getJobs).mockResolvedValue(
      makeAppliedJobsResponse([makeAppliedJob({ id: "job-applied-run" })]),
    );

    renderPage();
    await screen.findByText("Recent Sync Runs");

    fireEvent.click(screen.getByRole("button", { name: /run-1/i }));
    const dialog = await screen.findByRole("dialog");

    await waitFor(() => {
      expect(api.getJobs).toHaveBeenCalledWith({
        view: "list",
      });
    });

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Agree with suggested job match",
      }),
    );

    await waitFor(() => {
      expect(api.approvePostApplicationInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: "message-1",
          jobId: "job-applied-run",
        }),
      );
    });
  });

  it("disables decisions for zero-candidate messages when there are no applied jobs", async () => {
    vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
      items: [makeInboxItem({ candidates: [] })],
      total: 1,
    });
    vi.mocked(api.getJobs).mockResolvedValue(makeAppliedJobsResponse([]));

    renderPage();
    await screen.findByText(/thanks for applying to roku/i);

    await waitFor(() => {
      expect(api.getJobs).toHaveBeenCalledWith({
        view: "list",
      });
    });

    const approveButton = screen.getByRole("button", {
      name: "Agree with suggested job match",
    });
    expect(approveButton).toBeDisabled();
  });

  it("blocks sync and shows validation error for invalid numeric inputs", async () => {
    vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
      items: [],
      total: 0,
    });

    renderPage();
    await screen.findByText("Provider Controls");

    fireEvent.change(screen.getByLabelText("Max Messages"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Search Days"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Max messages must be 1-500 and search days must be 1-365 before syncing.",
      );
    });
    expect(api.postApplicationProviderSync).not.toHaveBeenCalled();
  });
});

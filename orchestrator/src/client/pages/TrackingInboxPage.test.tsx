import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { TrackingInboxPage } from "./TrackingInboxPage";

vi.mock("../api", () => ({
  postApplicationProviderStatus: vi.fn(),
  getPostApplicationInbox: vi.fn(),
  getPostApplicationRuns: vi.fn(),
  getJobs: vi.fn(),
  approvePostApplicationInboxItem: vi.fn(),
  denyPostApplicationInboxItem: vi.fn(),
  getPostApplicationRunMessages: vi.fn(),
  postApplicationGmailOauthStart: vi.fn(),
  postApplicationGmailOauthExchange: vi.fn(),
  postApplicationProviderSync: vi.fn(),
  postApplicationProviderDisconnect: vi.fn(),
}));

function makeInboxItem() {
  return {
    message: {
      id: "msg-1",
      provider: "gmail" as const,
      accountKey: "default",
      integrationId: null,
      syncRunId: null,
      externalMessageId: "ext-1",
      externalThreadId: null,
      fromAddress: "jobs@example.com",
      fromDomain: "example.com",
      senderName: "Recruiting",
      subject: "Interview invite",
      receivedAt: Date.now(),
      snippet: "Let's schedule",
      classificationLabel: "interview",
      classificationConfidence: 0.95,
      classificationPayload: null,
      relevanceLlmScore: 95,
      relevanceDecision: "relevant" as const,
      matchedJobId: "job-2",
      matchConfidence: 95,
      stageTarget: "technical_interview" as const,
      messageType: "interview" as const,
      stageEventPayload: null,
      processingStatus: "pending_user" as const,
      decidedAt: null,
      decidedBy: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    matchedJob: {
      id: "job-2",
      title: "Software Engineer",
      employer: "Example",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(api.postApplicationProviderStatus).mockResolvedValue({
    provider: "gmail",
    action: "status",
    accountKey: "default",
    status: {
      provider: "gmail",
      accountKey: "default",
      connected: true,
      integration: {
        id: "int-1",
        provider: "gmail",
        accountKey: "default",
        displayName: null,
        status: "connected",
        credentials: null,
        lastConnectedAt: null,
        lastSyncedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  });
  vi.mocked(api.getPostApplicationInbox).mockResolvedValue({
    items: [makeInboxItem()],
    total: 1,
  });
  vi.mocked(api.getPostApplicationRuns).mockResolvedValue({
    runs: [],
    total: 0,
  });
  vi.mocked(api.getJobs).mockResolvedValue({
    jobs: [
      {
        id: "job-1",
        source: "manual",
        title: "Software Engineer I",
        employer: "Example",
        jobUrl: "https://example.com/job-1",
        applicationLink: null,
        datePosted: null,
        deadline: null,
        salary: null,
        location: null,
        status: "applied",
        suitabilityScore: null,
        sponsorMatchScore: null,
        jobType: null,
        jobFunction: null,
        salaryMinAmount: null,
        salaryMaxAmount: null,
        salaryCurrency: null,
        discoveredAt: new Date().toISOString(),
        appliedAt: null,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "job-2",
        source: "manual",
        title: "Software Engineer II",
        employer: "Example",
        jobUrl: "https://example.com/job-2",
        applicationLink: null,
        datePosted: null,
        deadline: null,
        salary: null,
        location: null,
        status: "applied",
        suitabilityScore: null,
        sponsorMatchScore: null,
        jobType: null,
        jobFunction: null,
        salaryMinAmount: null,
        salaryMaxAmount: null,
        salaryCurrency: null,
        discoveredAt: new Date().toISOString(),
        appliedAt: null,
        updatedAt: new Date().toISOString(),
      },
    ],
    total: 2,
    byStatus: {
      discovered: 0,
      processing: 0,
      ready: 0,
      applied: 2,
      skipped: 0,
      expired: 0,
    },
    revision: "r1",
  } as Awaited<ReturnType<typeof api.getJobs>>);
  vi.mocked(api.approvePostApplicationInboxItem).mockResolvedValue({
    message: makeInboxItem().message,
    stageEventId: "evt-1",
  });
  vi.mocked(api.denyPostApplicationInboxItem).mockResolvedValue({
    message: {
      ...makeInboxItem().message,
      processingStatus: "ignored",
      matchedJobId: null,
    },
  });
  vi.mocked(api.getPostApplicationRunMessages).mockResolvedValue({
    run: {
      id: "run-1",
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
      status: "completed",
      startedAt: Date.now(),
      completedAt: Date.now(),
      messagesDiscovered: 1,
      messagesRelevant: 1,
      messagesClassified: 1,
      messagesMatched: 1,
      messagesApproved: 0,
      messagesDenied: 0,
      messagesErrored: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    items: [makeInboxItem()],
    total: 1,
  });
});

describe("TrackingInboxPage", () => {
  it("renders pending messages", async () => {
    render(
      <MemoryRouter>
        <TrackingInboxPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Interview invite")).toBeInTheDocument();
    });
  });

  it("submits approve action", async () => {
    render(
      <MemoryRouter>
        <TrackingInboxPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Interview invite")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Confirm email-job match" }),
    );

    await waitFor(() => {
      expect(api.approvePostApplicationInboxItem).toHaveBeenCalled();
    });
    expect(api.approvePostApplicationInboxItem).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-2",
      }),
    );
  });

  it("loads dropdown jobs excluding discovered status", async () => {
    render(
      <MemoryRouter>
        <TrackingInboxPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.getJobs).toHaveBeenCalledWith({
        statuses: ["applied"],
        view: "list",
      });
    });
  });
});

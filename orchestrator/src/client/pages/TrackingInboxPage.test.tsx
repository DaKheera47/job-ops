import type {
  PostApplicationInboxItem,
  PostApplicationProviderActionResponse,
  PostApplicationSyncRun,
} from "@shared/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  getPostApplicationInbox: vi.fn(),
  getPostApplicationRuns: vi.fn(),
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
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
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
          candidateId: "candidate-1",
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
          candidateId: "candidate-1",
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
});

import type {
  PostApplicationJobEmailItem,
  PostApplicationMessage,
} from "@shared/types.js";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/client/api";
import { renderWithQueryClient } from "@/client/test/renderWithQueryClient";
import { JobEmailsPanel } from "./JobEmailsPanel";

vi.mock("@/client/api", () => ({
  getJobEmails: vi.fn(),
}));

vi.mock("@/client/hooks/useQueryErrorToast", () => ({
  useQueryErrorToast: vi.fn(),
}));

const makeMessage = (
  overrides: Partial<PostApplicationMessage>,
): PostApplicationMessage => ({
  id: "msg-1",
  provider: "gmail",
  accountKey: "default",
  integrationId: "int-1",
  syncRunId: null,
  externalMessageId: "ext-1",
  externalThreadId: "thread-1",
  fromAddress: "jobs@example.com",
  fromDomain: "example.com",
  senderName: "Recruiting",
  subject: "Interview invite",
  receivedAt: 1_704_153_600_000,
  snippet: "Let's schedule an interview.",
  classificationLabel: "interview",
  classificationConfidence: 0.95,
  classificationPayload: null,
  relevanceLlmScore: 95,
  relevanceDecision: "relevant",
  matchedJobId: "job-1",
  matchConfidence: 95,
  stageTarget: "technical_interview",
  messageType: "interview",
  stageEventPayload: null,
  processingStatus: "auto_linked",
  decidedAt: null,
  decidedBy: null,
  errorCode: null,
  errorMessage: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeItem = (
  overrides: Omit<Partial<PostApplicationJobEmailItem>, "message"> & {
    message?: Partial<PostApplicationMessage>;
  } = {},
): PostApplicationJobEmailItem => {
  const { message, ...itemOverrides } = overrides;
  return {
    message: makeMessage(message ?? {}),
    sourceUrl: "https://mail.google.com/mail/u/0/#all/thread-1",
    accountDisplayName: "Work Gmail",
    ...itemOverrides,
  };
};

const renderPanel = () =>
  renderWithQueryClient(<JobEmailsPanel jobId="job-1" />);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getJobEmails).mockResolvedValue({
    items: [makeItem()],
    total: 1,
  });
});

describe("JobEmailsPanel", () => {
  it("renders stored email rows and Gmail links", async () => {
    renderPanel();

    expect(await screen.findByText("Interview invite")).toBeInTheDocument();
    expect(screen.getByText("Recruiting")).toBeInTheDocument();
    expect(
      screen.getByText("Let's schedule an interview."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Auto linked").length).toBeGreaterThan(1);
    expect(screen.getByText("95% confidence")).toBeInTheDocument();
    expect(screen.getByText("Work Gmail")).toBeInTheDocument();

    const link = screen.getByRole("link", {
      name: /open in gmail: interview invite/i,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://mail.google.com/mail/u/0/#all/thread-1",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("filters messages by processing status", async () => {
    vi.mocked(api.getJobEmails).mockResolvedValue({
      items: [
        makeItem({
          message: {
            id: "msg-auto",
            subject: "Auto match",
            processingStatus: "auto_linked",
          },
        }),
        makeItem({
          message: {
            id: "msg-manual",
            subject: "Manual match",
            processingStatus: "manual_linked",
          },
          sourceUrl: null,
        }),
      ],
      total: 2,
    });

    renderPanel();

    expect(await screen.findByText("Auto match")).toBeInTheDocument();
    expect(screen.getByText("Manual match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Manual" }));

    await waitFor(() =>
      expect(screen.queryByText("Auto match")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Manual match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Needs review" }));

    expect(
      await screen.findByText("No emails match this filter"),
    ).toBeInTheDocument();
  });

  it("shows the no linked emails empty state", async () => {
    vi.mocked(api.getJobEmails).mockResolvedValue({
      items: [],
      total: 0,
    });

    renderPanel();

    expect(await screen.findByText("No linked emails")).toBeInTheDocument();
  });

  it("shows an unavailable link state when sourceUrl is missing", async () => {
    vi.mocked(api.getJobEmails).mockResolvedValue({
      items: [
        makeItem({
          sourceUrl: null,
          message: {
            subject: "Provider metadata only",
            externalThreadId: null,
          },
        }),
      ],
      total: 1,
    });

    renderPanel();

    expect(
      await screen.findByText("Provider metadata only"),
    ).toBeInTheDocument();
    expect(screen.getByText("Gmail link unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open in gmail/i })).toBeNull();
  });
});

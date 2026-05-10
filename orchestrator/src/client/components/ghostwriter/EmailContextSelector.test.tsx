import type { PostApplicationJobEmailItem } from "@shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmailContextSelector } from "./EmailContextSelector";

const makeEmail = (
  overrides: Partial<PostApplicationJobEmailItem["message"]> = {},
): PostApplicationJobEmailItem => ({
  message: {
    id: "email-1",
    provider: "gmail",
    accountKey: "default",
    integrationId: null,
    syncRunId: null,
    externalMessageId: "gmail-1",
    externalThreadId: "thread-1",
    fromAddress: "recruiter@example.com",
    fromDomain: "example.com",
    senderName: "Recruiter",
    subject: "Interview update",
    receivedAt: 1_767_225_600_000,
    snippet: "Can you share your availability?",
    classificationLabel: null,
    classificationConfidence: null,
    classificationPayload: null,
    relevanceLlmScore: null,
    relevanceDecision: "relevant",
    matchedJobId: "job-1",
    matchConfidence: 91,
    stageTarget: "recruiter_screen",
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
  },
  accountDisplayName: "Work Gmail",
  sourceUrl: "https://mail.google.com/mail/u/0/#all/thread-1",
});

describe("EmailContextSelector", () => {
  it("renders emails and toggles a selected email", () => {
    const onChange = vi.fn();
    render(
      <EmailContextSelector
        emails={[makeEmail()]}
        selectedEmailIds={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /emails/i }));
    fireEvent.click(screen.getByLabelText(/Interview update/));

    expect(onChange).toHaveBeenCalledWith(["email-1"]);
  });

  it("shows trimming feedback and disables unchecked emails at the limit", () => {
    const selectedEmailIds = Array.from(
      { length: 8 },
      (_, index) => `email-${index + 1}`,
    );
    const emails = [
      ...selectedEmailIds.map((id, index) =>
        makeEmail({
          id,
          subject: `Selected email ${index + 1}`,
          snippet: "A".repeat(1201),
        }),
      ),
      makeEmail({ id: "email-9", subject: "Ninth email" }),
    ];

    render(
      <EmailContextSelector
        emails={emails}
        selectedEmailIds={selectedEmailIds}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /8 emails/i }));

    expect(screen.getAllByText("Trimmed for AI")).toHaveLength(8);
    expect(screen.getByLabelText(/Ninth email/)).toBeDisabled();
    expect(screen.getByText("8 email limit")).toBeInTheDocument();
  });
});

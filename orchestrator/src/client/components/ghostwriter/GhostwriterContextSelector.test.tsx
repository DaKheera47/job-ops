import type { JobNote, PostApplicationJobEmailItem } from "@shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GhostwriterContextSelector } from "./GhostwriterContextSelector";

const makeNote = (overrides: Partial<JobNote>): JobNote => ({
  id: "note-1",
  jobId: "job-1",
  title: "Recruiter call",
  content: "Bring examples about reliability work.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

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

function renderSelector(
  overrides: Partial<
    React.ComponentProps<typeof GhostwriterContextSelector>
  > = {},
) {
  return render(
    <GhostwriterContextSelector
      notes={[makeNote({})]}
      emails={[makeEmail()]}
      selectedNoteIds={[]}
      selectedEmailIds={[]}
      onNotesChange={vi.fn()}
      onEmailsChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("GhostwriterContextSelector", () => {
  it("renders notes and emails in one context picker", () => {
    const onNotesChange = vi.fn();
    const onEmailsChange = vi.fn();
    renderSelector({ onNotesChange, onEmailsChange });

    fireEvent.click(screen.getByRole("button", { name: /context/i }));

    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Emails")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Recruiter call/));
    fireEvent.click(screen.getByLabelText(/Interview update/));

    expect(onNotesChange).toHaveBeenCalledWith(["note-1"]);
    expect(onEmailsChange).toHaveBeenCalledWith(["email-1"]);
  });

  it("shows combined selected count in the trigger", () => {
    renderSelector({
      selectedNoteIds: ["note-1"],
      selectedEmailIds: ["email-1"],
    });

    expect(
      screen.getByRole("button", { name: /2 context/i }),
    ).toBeInTheDocument();
  });

  it("shows independent limits and trimming feedback per group", () => {
    const selectedNoteIds = Array.from(
      { length: 8 },
      (_, index) => `note-${index + 1}`,
    );
    const selectedEmailIds = Array.from(
      { length: 8 },
      (_, index) => `email-${index + 1}`,
    );

    renderSelector({
      notes: [
        ...selectedNoteIds.map((id, index) =>
          makeNote({
            id,
            title: `Selected note ${index + 1}`,
            content: "A".repeat(3001),
          }),
        ),
        makeNote({ id: "note-9", title: "Ninth note" }),
      ],
      emails: [
        ...selectedEmailIds.map((id, index) =>
          makeEmail({
            id,
            subject: `Selected email ${index + 1}`,
            snippet: "A".repeat(1201),
          }),
        ),
        makeEmail({ id: "email-9", subject: "Ninth email" }),
      ],
      selectedNoteIds,
      selectedEmailIds,
    });

    fireEvent.click(screen.getByRole("button", { name: /16 context/i }));

    expect(screen.getAllByText("Trimmed for AI")).toHaveLength(16);
    expect(screen.getByLabelText(/Ninth note/)).toBeDisabled();
    expect(screen.getByLabelText(/Ninth email/)).toBeDisabled();
    expect(screen.getByText("8 note limit")).toBeInTheDocument();
    expect(screen.getByText("8 email limit")).toBeInTheDocument();
  });
});

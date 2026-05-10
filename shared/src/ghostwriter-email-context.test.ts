import { describe, expect, it } from "vitest";
import {
  buildGhostwriterEmailContextItems,
  GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED,
  GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS,
  GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS,
  normalizeGhostwriterSelectedEmailIds,
} from "./ghostwriter-email-context";
import type { PostApplicationJobEmailItem } from "./types/post-application";

function makeEmail(
  overrides: Partial<PostApplicationJobEmailItem["message"]> = {},
): PostApplicationJobEmailItem {
  return {
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
  };
}

describe("ghostwriter email context", () => {
  it("normalizes selected email IDs", () => {
    expect(
      normalizeGhostwriterSelectedEmailIds([
        " email-1 ",
        "",
        "email-2",
        "email-1",
      ]),
    ).toEqual(["email-1", "email-2"]);
  });

  it("builds email context items with per-email and aggregate limits", () => {
    const emails = Array.from(
      { length: GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED },
      (_, index) =>
        makeEmail({
          id: `email-${index + 1}`,
          subject: `Email ${index + 1}`,
          snippet: "A".repeat(GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS + 1),
        }),
    );

    const context = buildGhostwriterEmailContextItems(emails);

    expect(context.items).toHaveLength(GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED);
    expect(context.items[0]?.snippet).toHaveLength(
      GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS,
    );
    expect(context.items[0]?.wasTrimmed).toBe(true);
    expect(
      context.items.reduce((total, item) => total + item.snippet.length, 0),
    ).toBeLessThanOrEqual(GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS);
    expect(context.wasTotalTrimmed).toBe(true);
  });
});

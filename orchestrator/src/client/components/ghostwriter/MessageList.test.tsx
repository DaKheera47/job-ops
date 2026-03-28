import type { BranchInfo, JobChatMessage } from "@shared/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageList } from "./MessageList";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("MessageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("copies assistant output to the clipboard", async () => {
    const messages: JobChatMessage[] = [
      {
        id: "assistant-1",
        threadId: "thread-1",
        jobId: "job-1",
        role: "assistant",
        content: "Tailored response draft",
        status: "complete",
        tokensIn: null,
        tokensOut: null,
        version: 1,
        replacesMessageId: null,
        parentMessageId: null,
        activeChildId: null,
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:00.000Z",
      },
    ];

    const branches: BranchInfo[] = [];

    render(
      <MessageList
        messages={messages}
        branches={branches}
        isStreaming={false}
        streamingMessageId={null}
        onRegenerate={vi.fn()}
        onEdit={vi.fn()}
        onSwitchBranch={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy response/i }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "Tailored response draft",
      ),
    );
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("only renders the copy button for completed assistant messages", () => {
    const messages: JobChatMessage[] = [
      {
        id: "assistant-partial",
        threadId: "thread-1",
        jobId: "job-1",
        role: "assistant",
        content: "Still streaming",
        status: "partial",
        tokensIn: null,
        tokensOut: null,
        version: 1,
        replacesMessageId: null,
        parentMessageId: null,
        activeChildId: null,
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:00.000Z",
      },
    ];

    render(
      <MessageList
        messages={messages}
        branches={[] satisfies BranchInfo[]}
        isStreaming={false}
        streamingMessageId={null}
        onRegenerate={vi.fn()}
        onEdit={vi.fn()}
        onSwitchBranch={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /copy response/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a friendly error when clipboard access is unavailable", () => {
    Object.assign(navigator, {
      clipboard: undefined,
    });

    const messages: JobChatMessage[] = [
      {
        id: "assistant-1",
        threadId: "thread-1",
        jobId: "job-1",
        role: "assistant",
        content: "Tailored response draft",
        status: "complete",
        tokensIn: null,
        tokensOut: null,
        version: 1,
        replacesMessageId: null,
        parentMessageId: null,
        activeChildId: null,
        createdAt: "2026-03-23T10:00:00.000Z",
        updatedAt: "2026-03-23T10:00:00.000Z",
      },
    ];

    render(
      <MessageList
        messages={messages}
        branches={[] satisfies BranchInfo[]}
        isStreaming={false}
        streamingMessageId={null}
        onRegenerate={vi.fn()}
        onEdit={vi.fn()}
        onSwitchBranch={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy response/i }));

    expect(toast.error).toHaveBeenCalledWith(
      "Copy is not available in this browser context",
    );
  });
});

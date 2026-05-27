import type { JobListItem, StageEvent } from "@shared/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { InProgressBoardPage } from "./InProgressBoardPage";

vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/dropdown-menu")>();

  return {
    ...actual,
    DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    DropdownMenuContent: ({ children }: { children: ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      onSelect,
      disabled,
    }: {
      children: ReactNode;
      onSelect?: () => void;
      disabled?: boolean;
    }) => (
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={onSelect}
      >
        {children}
      </button>
    ),
  };
});

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

const getBoardCardRoot = (cardTitle: HTMLElement): HTMLElement => {
  const cardRoot = cardTitle.closest("div.rounded-lg");
  if (!cardRoot) {
    throw new Error("Board card root not found");
  }
  return cardRoot as HTMLElement;
};

vi.mock("../api", () => ({
  getJobs: vi.fn(),
  getJobStageEvents: vi.fn(),
  transitionJobStage: vi.fn(),
  updateJobStageEvent: vi.fn(),
}));

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const makeJob = (overrides: Partial<JobListItem>): JobListItem => ({
  id: "job-1",
  source: "manual",
  sourceJobId: null,
  title: "Backend Engineer",
  employer: "Acme",
  jobUrl: "https://example.com/jobs/1",
  applicationLink: null,
  datePosted: null,
  deadline: null,
  salary: null,
  location: null,
  status: "in_progress",
  outcome: null,
  closedAt: null,
  suitabilityScore: null,
  sponsorMatchScore: null,
  appliedDuplicateMatch: null,
  jobType: null,
  jobFunction: null,
  pdfRegenerating: false,
  pdfFreshness: "missing",
  salaryMinAmount: null,
  salaryMaxAmount: null,
  salaryCurrency: null,
  discoveredAt: "2026-01-01T00:00:00.000Z",
  readyAt: null,
  appliedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeEvent = (overrides: Partial<StageEvent>): StageEvent => ({
  id: "evt-1",
  applicationId: "job-1",
  title: "Recruiter Screen",
  groupId: null,
  fromStage: "applied",
  toStage: "recruiter_screen",
  occurredAt: 1_700_000_000,
  metadata: null,
  outcome: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(api.getJobs).mockResolvedValue({
    jobs: [makeJob({})],
    total: 1,
    byStatus: {
      discovered: 0,
      processing: 0,
      ready: 0,
      applied: 0,
      in_progress: 1,
      skipped: 0,
      expired: 0,
    },
    revision: "r1",
  } as Awaited<ReturnType<typeof api.getJobs>>);
  vi.mocked(api.getJobStageEvents).mockResolvedValue([makeEvent({})]);
  vi.mocked(api.transitionJobStage).mockResolvedValue(
    makeEvent({ toStage: "offer", title: "Offer" }),
  );
});

describe("InProgressBoardPage", () => {
  it("loads in-progress jobs and renders cards", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.getJobs).toHaveBeenCalledWith({
        statuses: ["in_progress"],
        view: "list",
      });
    });

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
  });

  it("shows cards even when no stage events are present", async () => {
    vi.mocked(api.getJobStageEvents).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
  });

  it("transitions a job stage when dropped into another lane", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    const card = await screen.findByRole("link", { name: /Backend Engineer/i });
    const offerHeader = await screen.findByText("Offer");
    const offerLane = offerHeader.closest("section");

    if (!offerLane) {
      throw new Error("Offer lane section not found");
    }

    fireEvent.dragStart(card, {
      dataTransfer: {
        effectAllowed: "move",
      },
    });
    fireEvent.dragOver(offerLane);
    fireEvent.drop(offerLane);

    await waitFor(() => {
      expect(api.transitionJobStage).toHaveBeenCalledWith("job-1", {
        toStage: "offer",
        metadata: {
          actor: "user",
          eventType: "status_update",
          eventLabel: "Moved to Offer",
          reasonCode: "in_progress_board_drag",
        },
      });
    });
  });

  it("opens the log event modal from the card menu without navigating", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    const cardRoot = getBoardCardRoot(
      await screen.findByText("Backend Engineer"),
    );

    fireEvent.click(
      within(cardRoot).getByRole("menuitem", { name: /log event/i }),
    );

    expect(screen.getByTestId("log-event-modal")).toBeInTheDocument();
    expect(
      screen.getByText(
        /record a new update or stage change for backend engineer at acme/i,
      ),
    ).toBeInTheDocument();
  });

  it("logs an event from the board menu", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    const cardRoot = getBoardCardRoot(
      await screen.findByText("Backend Engineer"),
    );

    fireEvent.click(
      within(cardRoot).getByRole("menuitem", { name: /log event/i }),
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Recruiter Screen"), {
      target: { value: "Phone screen" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^log event$/i }));

    await waitFor(() => {
      expect(api.transitionJobStage).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({
          metadata: expect.objectContaining({
            eventLabel: "Phone screen",
            actor: "user",
          }),
        }),
      );
    });

    expect(toast.success).toHaveBeenCalledWith("Event logged");
  });

  it("surfaces load errors", async () => {
    vi.mocked(api.getJobs).mockRejectedValue(new Error("Failed to load board"));

    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load board");
    });
  });
});

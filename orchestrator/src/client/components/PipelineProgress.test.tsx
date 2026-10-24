import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SseHandlers = {
  onOpen?: () => void;
  onMessage: (payload: unknown) => void;
  onError?: () => void;
};

const sseMock = vi.hoisted(() => ({
  handlers: null as SseHandlers | null,
  subscribeToEventSource: vi.fn(),
}));
const apiMock = vi.hoisted(() => ({
  getPipelineProgressSnapshot: vi.fn(),
  prepareChallengeViewer: vi.fn(),
  resumePipelineScoring: vi.fn(),
  solvePipelineChallenge: vi.fn(),
}));

vi.mock("@client/api", () => apiMock);
vi.mock("@/client/lib/sse", () => ({
  subscribeToEventSource: sseMock.subscribeToEventSource,
}));

import { PipelineProgress } from "./PipelineProgress";

const fanout = {
  termCount: 2,
  locationCount: 3,
  sourceCount: 4,
  locations: ["Manchester", "London", "Leeds"],
  sources: ["linkedin", "indeed", "glassdoor", "gradcracker"],
  total: 4,
  capacity: 3,
  results: 12,
  unique: 9,
  roles: [
    { role: "Backend", complete: 1, running: 1, queued: 0, check: 0 },
    { role: "Platform", complete: 0, running: 1, queued: 1, check: 0 },
  ],
};

const baseProgress = {
  step: "crawling" as const,
  message: "Fetching jobs from sources...",
  detail: "JobSpy: term 1/2 (Backend)",
  startedAt: "2026-07-15T12:00:00.000Z",
  fanout,
  crawlingSource: "jobspy",
  crawlingSourcesCompleted: 0,
  crawlingSourcesTotal: 2,
  crawlingTermsProcessed: 0,
  crawlingTermsTotal: 2,
  crawlingListPagesProcessed: 0,
  crawlingListPagesTotal: 0,
  crawlingJobCardsFound: 0,
  crawlingJobPagesEnqueued: 0,
  crawlingJobPagesSkipped: 0,
  crawlingJobPagesProcessed: 0,
  jobsDiscovered: 0,
  jobsScored: 0,
  jobsExceptional: 0,
  jobsProcessed: 0,
  totalToProcess: 0,
};

describe("PipelineProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:02:14.000Z"));
    sseMock.handlers = null;
    sseMock.subscribeToEventSource.mockReset();
    sseMock.subscribeToEventSource.mockImplementation(
      (_url: string, handlers: SseHandlers) => {
        sseMock.handlers = handlers;
        return vi.fn();
      },
    );
    apiMock.getPipelineProgressSnapshot.mockReset();
    apiMock.getPipelineProgressSnapshot.mockResolvedValue(baseProgress);
    apiMock.prepareChallengeViewer.mockReset();
    apiMock.resumePipelineScoring.mockReset();
    apiMock.resumePipelineScoring.mockResolvedValue({ resolved: true });
    apiMock.solvePipelineChallenge.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("updates activity only from SSE events while the elapsed timer advances", () => {
    render(<PipelineProgress isRunning />);
    act(() => sseMock.handlers?.onOpen?.());
    act(() => sseMock.handlers?.onMessage(baseProgress));

    expect(screen.getByText("Searching jobs")).toBeInTheDocument();
    const activity = screen.getByText("Latest activity:").parentElement;
    expect(activity).toHaveTextContent(baseProgress.detail);
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("02:14 elapsed")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("02:24 elapsed")).toBeInTheDocument();
    expect(activity).toHaveTextContent(baseProgress.detail);
    expect(apiMock.getPipelineProgressSnapshot).not.toHaveBeenCalled();

    act(() =>
      sseMock.handlers?.onMessage({
        ...baseProgress,
        detail: "Hiring Cafe: term 2/2, page 3 (24 collected)",
      }),
    );
    expect(activity).toHaveTextContent(
      "Hiring Cafe: term 2/2, page 3 (24 collected)",
    );
    expect(activity).not.toHaveTextContent(baseProgress.detail);
  });

  it("falls back to snapshot polling when SSE does not open", async () => {
    apiMock.getPipelineProgressSnapshot.mockResolvedValueOnce({
      ...baseProgress,
      detail: undefined,
    });
    render(<PipelineProgress isRunning />);

    await act(async () => vi.advanceTimersByTimeAsync(1500));

    expect(apiMock.getPipelineProgressSnapshot).toHaveBeenCalledTimes(1);
    const activity = screen.getByText("Latest activity:").parentElement;
    expect(activity).toHaveTextContent(baseProgress.message);

    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(activity).toHaveTextContent(baseProgress.detail);

    act(() => sseMock.handlers?.onOpen?.());
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(apiMock.getPipelineProgressSnapshot).toHaveBeenCalledTimes(2);
  });

  it("hides the fanout card after discovery", () => {
    render(<PipelineProgress isRunning />);
    act(() =>
      sseMock.handlers?.onMessage({ ...baseProgress, step: "importing" }),
    );

    expect(screen.queryByText("Searching jobs")).toBeNull();
  });

  it("renders the live scoring card after discovery", () => {
    render(<PipelineProgress isRunning />);
    act(() =>
      sseMock.handlers?.onMessage({
        ...baseProgress,
        step: "scoring",
        message: "Scoring jobs...",
        detail: "Using AI to evaluate job fit",
        jobsDiscovered: 100,
        jobsScored: 50,
        jobsExceptional: 7,
        currentJob: {
          id: "job-1",
          title: "Frontend Engineer",
          employer: "Monzo",
        },
      }),
    );

    expect(screen.getByText("Scoring matches")).toBeInTheDocument();
    expect(
      screen.getByTitle("Ranking Frontend Engineer against your profile"),
    ).toBeInTheDocument();
    expect(screen.getByText("Exceptional matches")).toBeInTheDocument();
    expect(screen.queryByText("Searching jobs")).toBeNull();
  });

  it("keeps polling after LLM configuration is added", async () => {
    apiMock.getPipelineProgressSnapshot
      .mockResolvedValueOnce({
        ...baseProgress,
        step: "configuration_required",
        error: "Add an API key.",
      })
      .mockResolvedValueOnce({
        ...baseProgress,
        step: "scoring",
        message: "Scoring jobs...",
      });
    render(<PipelineProgress isRunning />);

    await act(async () => vi.advanceTimersByTimeAsync(1500));

    fireEvent.click(screen.getByRole("button", { name: "Restart scoring" }));
    await act(async () => vi.advanceTimersByTimeAsync(2000));

    expect(apiMock.resumePipelineScoring).toHaveBeenCalledOnce();
    expect(apiMock.getPipelineProgressSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Scoring matches")).toBeInTheDocument();
  });

  it("renders browser challenges from live progress", () => {
    render(<PipelineProgress isRunning />);
    act(() =>
      sseMock.handlers?.onMessage({
        ...baseProgress,
        step: "challenge_required",
        pendingChallenges: [
          {
            extractorId: "gradcracker",
            extractorName: "Gradcracker",
            url: "https://example.com/challenge",
            sources: ["gradcracker"],
          },
        ],
      }),
    );

    expect(screen.getByText("Gradcracker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Solve" })).toBeInTheDocument();
  });

  it("shows solve confirmation then closes the viewer tab", async () => {
    const viewerWindow = {
      opener: null,
      location: { href: "" },
      close: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(viewerWindow);
    apiMock.prepareChallengeViewer.mockResolvedValue({
      available: true,
      viewerUrl: "/challenge-viewer/session/token/vnc.html",
      reason: null,
    });
    apiMock.solvePipelineChallenge.mockResolvedValue({
      status: "solved",
      extractorId: "hiringcafe",
      challengesRemaining: 0,
      cookiesSaved: 0,
    });

    render(<PipelineProgress isRunning />);
    act(() =>
      sseMock.handlers?.onMessage({
        ...baseProgress,
        step: "challenge_required",
        pendingChallenges: [
          {
            extractorId: "hiringcafe",
            extractorName: "Hiring Cafe",
            url: "https://hiringcafe.com/job/req-1",
            sources: ["hiringcafe"],
          },
        ],
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Solve" }));
    });

    expect(viewerWindow.location.href).toBe("/challenge-viewer/solved");
    expect(viewerWindow.close).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(viewerWindow.close).toHaveBeenCalledOnce();
  });
});

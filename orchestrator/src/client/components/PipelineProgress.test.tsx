import { act, render, screen } from "@testing-library/react";
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
    apiMock.solvePipelineChallenge.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders live fanout data from SSE", () => {
    render(<PipelineProgress isRunning />);
    act(() => sseMock.handlers?.onMessage(baseProgress));

    expect(screen.getByText("Searching 4 combinations")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("(02:14 elapsed)")).toBeInTheDocument();
    expect(screen.getByText("glassdoor × backend × leeds")).toBeInTheDocument();
  });

  it("falls back to snapshot polling when SSE does not open", async () => {
    render(<PipelineProgress isRunning />);

    await act(async () => vi.advanceTimersByTimeAsync(1500));

    expect(apiMock.getPipelineProgressSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Searching 4 combinations")).toBeInTheDocument();
  });

  it("hides the fanout card after discovery", () => {
    render(<PipelineProgress isRunning />);
    act(() =>
      sseMock.handlers?.onMessage({ ...baseProgress, step: "importing" }),
    );

    expect(screen.queryByText("Searching 4 combinations")).toBeNull();
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
});

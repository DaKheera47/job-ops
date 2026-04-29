import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SseHandlers = {
  onOpen?: () => void;
  onMessage: (payload: unknown) => void;
  onError?: () => void;
};

type MockSseInstance = {
  url: string;
  handlers: SseHandlers;
  unsubscribe: ReturnType<typeof vi.fn>;
};

const sseMock = vi.hoisted(() => ({
  instances: [] as MockSseInstance[],
  subscribeToEventSource: vi.fn(),
}));

const apiMock = vi.hoisted(() => ({
  getPipelineProgressSnapshot: vi.fn(),
}));

vi.mock("@client/api", () => ({
  getPipelineProgressSnapshot: apiMock.getPipelineProgressSnapshot,
}));

vi.mock("@/client/lib/sse", () => ({
  subscribeToEventSource: sseMock.subscribeToEventSource,
}));

import { PipelineProgress } from "./PipelineProgress";

const baseProgress = {
  step: "crawling" as const,
  message: "Fetching jobs from sources...",
  detail: "Running crawler",
  crawlingSource: "jobspy" as const,
  crawlingSourcesCompleted: 1,
  crawlingSourcesTotal: 3,
  crawlingTermsProcessed: 2,
  crawlingTermsTotal: 4,
  crawlingListPagesProcessed: 0,
  crawlingListPagesTotal: 0,
  crawlingJobCardsFound: 0,
  crawlingJobPagesEnqueued: 0,
  crawlingJobPagesSkipped: 0,
  crawlingJobPagesProcessed: 0,
  crawlingPhase: "list" as const,
  crawlingCurrentUrl: "engineer",
  jobsDiscovered: 0,
  jobsScored: 0,
  jobsProcessed: 0,
  totalToProcess: 0,
};

describe("PipelineProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sseMock.instances.length = 0;
    sseMock.subscribeToEventSource.mockReset();
    sseMock.subscribeToEventSource.mockImplementation(
      (url: string, handlers: SseHandlers) => {
        const instance: MockSseInstance = {
          url,
          handlers,
          unsubscribe: vi.fn(),
        };
        sseMock.instances.push(instance);
        return instance.unsubscribe;
      },
    );
    apiMock.getPipelineProgressSnapshot.mockReset();
    apiMock.getPipelineProgressSnapshot.mockResolvedValue(baseProgress);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const getSse = () => {
    const instance = sseMock.instances[0];
    if (!instance) {
      throw new Error("Expected subscribeToEventSource to be called");
    }
    return {
      emitOpen: () => instance.handlers.onOpen?.(),
      emitMessage: (payload: unknown) => instance.handlers.onMessage(payload),
      emitError: () => instance.handlers.onError?.(),
      close: instance.unsubscribe,
    };
  };

  it("renders renamed crawling labels and source/terms context", () => {
    render(<PipelineProgress isRunning />);
    const sse = getSse();

    act(() => {
      sse.emitOpen();
      sse.emitMessage({
        ...baseProgress,
        crawlingListPagesProcessed: 3,
        crawlingListPagesTotal: 10,
        crawlingJobPagesProcessed: 8,
        crawlingJobPagesEnqueued: 30,
        crawlingJobPagesSkipped: 4,
      });
    });

    expect(screen.getByText("List pages")).toBeInTheDocument();
    expect(screen.getByText("Job pages")).toBeInTheDocument();
    expect(screen.getByText("Enqueued")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("3/10")).toBeInTheDocument();
    expect(screen.getByText("8/30")).toBeInTheDocument();
    expect(
      screen.getByText(/Source:\s+JobSpy\s+\(1\/3\)\s+Terms:\s+2\/4/),
    ).toBeInTheDocument();
  });

  it("uses fallback dashes for unknown page denominators", () => {
    render(<PipelineProgress isRunning />);
    const sse = getSse();

    act(() => {
      sse.emitOpen();
      sse.emitMessage(baseProgress);
    });

    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to snapshot polling when SSE does not open", async () => {
    render(<PipelineProgress isRunning />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(apiMock.getPipelineProgressSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Updating…")).toBeInTheDocument();
    expect(screen.getByText(baseProgress.message)).toBeInTheDocument();
  });

  it("stops snapshot polling after a terminal snapshot state", async () => {
    apiMock.getPipelineProgressSnapshot.mockResolvedValueOnce({
      ...baseProgress,
      step: "failed",
      message: "Pipeline failed",
      error: "Boom",
    });

    render(<PipelineProgress isRunning />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(apiMock.getPipelineProgressSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Pipeline failed")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(apiMock.getPipelineProgressSnapshot).toHaveBeenCalledTimes(1);
  });
});

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PipelineProgress } from "./PipelineProgress";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  close = vi.fn();

  emitOpen() {
    this.onopen?.(new Event("open"));
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({
      data: JSON.stringify(payload),
    } as MessageEvent);
  }
}

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
    MockEventSource.instances = [];
    (globalThis as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders renamed crawling labels and source/terms context", () => {
    render(<PipelineProgress isRunning />);
    const sse = MockEventSource.instances[0];

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
    const sse = MockEventSource.instances[0];

    act(() => {
      sse.emitOpen();
      sse.emitMessage(baseProgress);
    });

    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});

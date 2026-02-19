import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { TracerLinksPage } from "./TracerLinksPage";

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

vi.mock("../api", () => ({
  getTracerAnalytics: vi.fn(),
  getJobTracerLinks: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(api.getTracerAnalytics).mockResolvedValue({
    filters: {
      jobId: null,
      from: null,
      to: null,
      includeBots: false,
      limit: 20,
    },
    totals: {
      clicks: 12,
      uniqueOpens: 10,
      botClicks: 3,
      humanClicks: 9,
    },
    timeSeries: [
      {
        day: "2026-02-01",
        clicks: 12,
        uniqueOpens: 10,
        botClicks: 3,
        humanClicks: 9,
      },
    ],
    topJobs: [
      {
        jobId: "job-1",
        title: "Backend Engineer",
        employer: "Acme",
        clicks: 7,
        uniqueOpens: 6,
        botClicks: 2,
        humanClicks: 5,
        lastClickedAt: 1_700_000_000,
      },
    ],
    topLinks: [
      {
        tracerLinkId: "tl-1",
        token: "token-1",
        jobId: "job-1",
        title: "Backend Engineer",
        employer: "Acme",
        sourcePath: "resume.pdf",
        sourceLabel: "Resume",
        destinationUrl: "https://example.com/apply",
        clicks: 7,
        uniqueOpens: 6,
        botClicks: 2,
        humanClicks: 5,
        lastClickedAt: 1_700_000_000,
      },
    ],
  });

  vi.mocked(api.getJobTracerLinks).mockResolvedValue({
    job: {
      id: "job-1",
      title: "Backend Engineer",
      employer: "Acme",
      tracerLinksEnabled: true,
    },
    totals: {
      links: 1,
      clicks: 7,
      uniqueOpens: 6,
      botClicks: 2,
      humanClicks: 5,
    },
    links: [
      {
        tracerLinkId: "tl-1",
        token: "token-1",
        sourcePath: "resume.pdf",
        sourceLabel: "Resume",
        destinationUrl: "https://example.com/apply",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clicks: 7,
        uniqueOpens: 6,
        botClicks: 2,
        humanClicks: 5,
        lastClickedAt: 1_700_000_000,
      },
    ],
  });
});

describe("TracerLinksPage", () => {
  it("renders analytics cards and top job rows", async () => {
    render(
      <MemoryRouter>
        <TracerLinksPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("loads job drilldown when selecting a top job", async () => {
    render(
      <MemoryRouter>
        <TracerLinksPage />
      </MemoryRouter>,
    );

    const row = await screen.findByRole("row", { name: /Backend Engineer/i });
    fireEvent.click(row);

    await waitFor(() => {
      expect(api.getJobTracerLinks).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({ includeBots: false }),
      );
    });

    expect(
      await screen.findByText(/Job Links: Backend Engineer/),
    ).toBeInTheDocument();
  });

  it("refetches analytics when include bots filter changes", async () => {
    render(
      <MemoryRouter>
        <TracerLinksPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Filters" }));
    const includeBotsToggle = await screen.findByText("Include likely bots");
    fireEvent.click(includeBotsToggle);

    await waitFor(() => {
      expect(api.getTracerAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({ includeBots: true, limit: 20 }),
      );
    });
  });
});

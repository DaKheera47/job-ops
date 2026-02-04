import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("UK Visa Jobs API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("enforces pagination rules for search", async () => {
    const badRes = await fetch(`${baseUrl}/api/ukvisajobs/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchTerms: ["one", "two"] }),
    });
    expect(badRes.status).toBe(400);
  });

  it("searches UK Visa Jobs with valid payloads", async () => {
    const { fetchUkVisaJobsPage } = await import("../../services/ukvisajobs");
    vi.mocked(fetchUkVisaJobsPage).mockResolvedValue({
      jobs: [
        {
          source: "ukvisajobs",
          title: "Engineer",
          employer: "Acme",
          jobUrl: "https://example.com/visa/1",
        },
      ],
      totalJobs: 3,
      page: 1,
      pageSize: 2,
    });

    const res = await fetch(`${baseUrl}/api/ukvisajobs/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "engineer" }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.totalPages).toBe(2);
    expect(fetchUkVisaJobsPage).toHaveBeenCalledWith({
      searchKeyword: "engineer",
      page: 1,
    });
  });

  it("blocks search when pipeline is running", async () => {
    const { getPipelineStatus } = await import("../../pipeline/index");
    vi.mocked(getPipelineStatus).mockReturnValue({ isRunning: true });

    const res = await fetch(`${baseUrl}/api/ukvisajobs/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "engineer" }),
    });
    expect(res.status).toBe(409);
  });

  it("imports UK Visa Jobs and reports created vs skipped", async () => {
    const res = await fetch(`${baseUrl}/api/ukvisajobs/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: [
          {
            title: "Engineer",
            employer: "Acme",
            jobUrl: "https://example.com/visa/2",
          },
          {
            title: "Engineer Duplicate",
            employer: "Acme",
            jobUrl: "https://example.com/visa/2",
          },
        ],
      }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.created).toBe(1);
    expect(body.data.skipped).toBe(1);
  });
});

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { startServer, stopServer } from "./api/routes/test-utils";
import * as visaSponsors from "./services/visa-sponsors/index";

const mocks = vi.hoisted(() => ({
  fetchFreeHirePage: vi.fn(),
}));

vi.mock("../../../extractors/freehire/src/run.js", () => ({
  fetchFreeHirePage: mocks.fetchFreeHirePage,
}));

type RpcResponse = {
  result?: {
    serverInfo?: { name: string; version: string };
    tools?: Array<{ name: string; inputSchema?: Record<string, unknown> }>;
    structuredContent?: Record<string, unknown>;
  };
  error?: {
    code: number;
    data?: Record<string, unknown>;
  };
};

async function callMcp(
  baseUrl: string,
  id: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<RpcResponse> {
  const response = await fetch(`${baseUrl}/ojcp/mcp`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as RpcResponse;
}

describe.sequential("OJCP MCP", () => {
  let running: Awaited<ReturnType<typeof startServer>> | undefined;

  beforeAll(async () => {
    running = await startServer();
  });

  beforeEach(async () => {
    const { __resetOjcpCachesForTests } = await import("./ojcp");
    __resetOjcpCachesForTests();
    mocks.fetchFreeHirePage.mockReset().mockResolvedValue({
      jobs: [
        {
          source: "freehire",
          sourceJobId: "senior-go-engineer-acme",
          title: "Senior Go Engineer",
          employer: "Acme Limited",
          jobUrl: "https://example.com/jobs/123",
          applicationLink: "https://example.com/jobs/123/apply",
          datePosted: "2026-08-22T10:00:00Z",
          location: "London, United Kingdom",
          jobDescription: "Build reliable Go services.",
          jobType: "full_time",
          salaryMinAmount: 90_000,
          salaryMaxAmount: 120_000,
          salaryCurrency: "GBP",
          skills: "Go, PostgreSQL",
          workFromHomeType: "hybrid",
        },
      ],
      limit: 1,
      offset: 20,
      total: 321,
    });
    vi.mocked(visaSponsors.searchSponsorsExact)
      .mockReset()
      .mockImplementation(async (employer: string) => ({
        available: true,
        providerIds: ["uk"],
        results:
          employer === "Acme Limited"
            ? [
                {
                  providerId: "uk",
                  countryKey: "united kingdom",
                  score: 100,
                  sponsor: {
                    organisationName: "ACME LIMITED",
                    townCity: "London",
                    county: "",
                    typeRating: "Worker",
                    route: "Skilled Worker",
                  },
                  matchedName: "acme",
                },
              ]
            : [],
      }));
  });

  afterAll(async () => {
    if (running) await stopServer(running);
  });

  it("discovers the provider and serves cached details from live FreeHire search", async () => {
    if (!running) throw new Error("Test server did not start");
    const manifestResponse = await fetch(
      `${running.baseUrl}/.well-known/ojcp.json`,
    );
    const manifest = (await manifestResponse.json()) as Record<string, unknown>;
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.headers.get("cache-control")).toBe(
      "public, max-age=3600",
    );
    expect(manifest).toMatchObject({
      ojcp_version: "0.1",
      mcp_endpoint: `${running.baseUrl}/ojcp/mcp`,
      tools: ["search_jobs", "get_job_detail"],
      auth: { required: false },
    });

    const initialized = await callMcp(running.baseUrl, 1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "jobops-test", version: "1.0.0" },
    });
    expect(initialized.result?.serverInfo).toEqual({
      name: "jobops-ojcp",
      version: "0.1",
    });

    const listed = await callMcp(running.baseUrl, 2, "tools/list");
    expect(listed.result?.tools?.map((tool) => tool.name)).toEqual([
      "search_jobs",
      "get_job_detail",
    ]);
    expect(
      listed.result?.tools?.find((tool) => tool.name === "search_jobs")
        ?.inputSchema,
    ).toMatchObject({
      properties: {
        candidate_context: {
          type: "object",
          properties: {
            consent_scope: { type: "array", minItems: 1 },
          },
          required: ["consent_scope"],
        },
      },
    });

    const searchArguments = {
      query: "senior backend engineer",
      location: {
        city: "London",
        country: "UK",
        remote_ok: false,
      },
      pagination: { limit: 1, offset: 20 },
    };
    const searched = await callMcp(running.baseUrl, 3, "tools/call", {
      name: "search_jobs",
      arguments: searchArguments,
    });
    expect(searched.result?.structuredContent).toMatchObject({
      ojcp_version: "0.1",
      total_results: 321,
      returned: 1,
      offset: 20,
      jobs: [
        {
          ojcp_id: "jobops:freehire:senior-go-engineer-acme",
          title: "Senior Go Engineer",
          visa_sponsor_match: {
            exact_name_match: true,
            provider_id: "uk",
            matched_organisations: ["ACME LIMITED"],
          },
        },
      ],
    });
    expect(mocks.fetchFreeHirePage).toHaveBeenCalledWith({
      searchTerm: "senior backend engineer",
      selectedCountry: "UK",
      locations: ["London"],
      workplaceTypes: ["hybrid", "onsite"],
      limit: 1,
      offset: 20,
      timeoutMs: 5_000,
    });
    expect(visaSponsors.searchSponsorsExact).toHaveBeenCalledWith(
      "Acme Limited",
      { countryKey: "united kingdom" },
    );

    await callMcp(running.baseUrl, 4, "tools/call", {
      name: "search_jobs",
      arguments: searchArguments,
    });
    expect(mocks.fetchFreeHirePage).toHaveBeenCalledTimes(1);

    const detailed = await callMcp(running.baseUrl, 5, "tools/call", {
      name: "get_job_detail",
      arguments: { job_id: "jobops:freehire:senior-go-engineer-acme" },
    });
    expect(detailed.result?.structuredContent).toMatchObject({
      ojcp_version: "0.1",
      job: {
        ojcp_id: "jobops:freehire:senior-go-engineer-acme",
        title: "Senior Go Engineer",
        description: "Build reliable Go services.",
      },
      employer_context: { name: "Acme Limited" },
    });

    const missing = await callMcp(running.baseUrl, 6, "tools/call", {
      name: "get_job_detail",
      arguments: { job_id: "jobops:freehire:missing" },
    });
    expect(missing.error).toMatchObject({
      code: -32000,
      data: { ojcp_version: "0.1", error_code: "job_not_found" },
    });
  });

  it("rejects filters that FreeHire cannot apply correctly", async () => {
    if (!running) throw new Error("Test server did not start");
    const response = await callMcp(running.baseUrl, 7, "tools/call", {
      name: "search_jobs",
      arguments: {
        query: "backend engineer",
        filters: { salary_min: 90_000 },
      },
    });

    expect(response.error).toMatchObject({
      code: -32000,
      data: {
        ojcp_version: "0.1",
        error_code: "unsupported_filter",
        details: { unsupported_filters: ["filters.salary_min"] },
      },
    });
    expect(mocks.fetchFreeHirePage).not.toHaveBeenCalled();
  });

  it("returns a sanitized provider error when FreeHire fails", async () => {
    if (!running) throw new Error("Test server did not start");
    mocks.fetchFreeHirePage.mockRejectedValueOnce(
      new Error("FreeHire request failed with status 503"),
    );

    const response = await callMcp(running.baseUrl, 8, "tools/call", {
      name: "search_jobs",
      arguments: { query: "backend engineer" },
    });

    expect(response.error).toMatchObject({
      code: -32000,
      data: { ojcp_version: "0.1", error_code: "provider_error" },
    });
    expect(JSON.stringify(response)).not.toContain("503");
  });
});

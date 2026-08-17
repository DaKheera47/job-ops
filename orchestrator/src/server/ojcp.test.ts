import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./api/routes/test-utils";

type RpcResponse = {
  result?: {
    serverInfo?: { name: string; version: string };
    tools?: Array<{ name: string }>;
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
  let defaultJobId: string;

  beforeAll(async () => {
    running = await startServer({ env: { DEMO_MODE: "true" } });
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import("@infra/request-context");
    const jobsRepo = await import("@server/repositories/jobs");

    const defaultJob = await runWithRequestContext(
      {
        requestId: "ojcp-seed-default",
        tenantId: "tenant_default",
        userId: "test-user",
      },
      () =>
        jobsRepo.createJob({
          source: "manual",
          title: "Senior Platform Engineer",
          employer: "Default Workspace Ltd",
          jobUrl: "https://example.com/default-platform-engineer",
          applicationLink:
            "https://example.com/default-platform-engineer/apply",
          datePosted: "2026-08-01",
          location: "London, United Kingdom",
          jobDescription: "Build reliable TypeScript platform services.",
          jobType: "full time",
          salaryMinAmount: 80_000,
          salaryMaxAmount: 100_000,
          salaryCurrency: "GBP",
          skills: JSON.stringify(["TypeScript", "Platform Engineering"]),
        }),
    );
    defaultJobId = defaultJob.id;

    await db.insert(schema.tenants).values({
      id: "tenant-ojcp-alt",
      name: "OJCP Alt",
      slug: "tenant-ojcp-alt",
    });
    await runWithRequestContext(
      {
        requestId: "ojcp-seed-alt",
        tenantId: "tenant-ojcp-alt",
        userId: "test-user",
      },
      () =>
        jobsRepo.createJob({
          source: "manual",
          title: "Senior Platform Engineer",
          employer: "Other Tenant Secret Ltd",
          jobUrl: "https://example.com/alt-platform-engineer",
          datePosted: "2026-08-02",
          location: "London, United Kingdom",
          jobDescription: "This job must never cross tenant boundaries.",
        }),
    );
  });

  afterAll(async () => {
    if (running) await stopServer(running);
  });

  it("discovers, searches, and reads tenant-scoped jobs over MCP", async () => {
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

    const searched = await callMcp(running.baseUrl, 3, "tools/call", {
      name: "search_jobs",
      arguments: {
        query: "platform engineer",
        filters: { employment_type: "full_time", salary_min: 90_000 },
        pagination: { limit: 1, offset: 0 },
      },
    });
    const searchData = searched.result?.structuredContent;
    expect(searchData).toMatchObject({
      ojcp_version: "0.1",
      total_results: 1,
      returned: 1,
      offset: 0,
    });
    const searchJson = JSON.stringify(searchData);
    expect(searchJson).toContain("Default Workspace Ltd");
    expect(searchJson).not.toContain("Other Tenant Secret Ltd");

    const detailed = await callMcp(running.baseUrl, 4, "tools/call", {
      name: "get_job_detail",
      arguments: { job_id: `jobops:${defaultJobId}` },
    });
    expect(detailed.result?.structuredContent).toMatchObject({
      ojcp_version: "0.1",
      job: {
        ojcp_id: `jobops:${defaultJobId}`,
        title: "Senior Platform Engineer",
        datePosted: "2026-08-01",
      },
      employer_context: { name: "Default Workspace Ltd" },
    });

    const missing = await callMcp(running.baseUrl, 5, "tools/call", {
      name: "get_job_detail",
      arguments: { job_id: "jobops:missing" },
    });
    expect(missing.error).toMatchObject({
      code: -32000,
      data: {
        ojcp_version: "0.1",
        error_code: "job_not_found",
      },
    });
  });
});

import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/services/rxresume", () => ({
  listResumes: vi.fn(),
  getResume: vi.fn(),
  validateResumeSchema: vi.fn(async (data: unknown) => ({
    ok: true,
    mode:
      data &&
      typeof data === "object" &&
      typeof (data as Record<string, unknown>).summary === "object"
        ? "v5"
        : "v4",
    data,
  })),
  extractProjectsFromResume: vi.fn((data: unknown) => {
    const root = (data ?? {}) as Record<string, unknown>;
    const sections = (root.sections ?? {}) as Record<string, unknown>;
    const projects = (sections.projects ?? {}) as Record<string, unknown>;
    const items = Array.isArray(projects.items) ? projects.items : [];
    return {
      mode: "v5",
      catalog: items.map((item) => {
        const project = item as Record<string, unknown>;
        return {
          id: String(project.id ?? ""),
          name: String(project.name ?? ""),
          description: String(project.description ?? ""),
          date: String(project.period ?? ""),
          isVisibleInBase: !project.hidden,
        };
      }),
    };
  }),
  RxResumeAuthConfigError: class RxResumeAuthConfigError extends Error {
    constructor(message = "Reactive Resume auth config missing") {
      super(message);
      this.name = "RxResumeAuthConfigError";
    }
  },
  RxResumeRequestError: class RxResumeRequestError extends Error {
    status: number | null;
    constructor(
      message = "Reactive Resume request failed",
      status: number | null = null,
    ) {
      super(message);
      this.name = "RxResumeRequestError";
      this.status = status;
    }
  },
}));

import {
  extractProjectsFromResume,
  getResume,
} from "@server/services/rxresume";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Settings API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        LLM_API_KEY: "secret-key",
        RXRESUME_EMAIL: "resume@example.com",
      },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("returns settings with defaults", async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.model.default).toBe("test-model");
    expect(Array.isArray(body.data.searchTerms.value)).toBe(true);
    expect(body.data.rxresumeEmail).toBe("resume@example.com");
    expect(body.data.llmApiKeyHint).toBe("secr");
    expect(body.data.basicAuthActive).toBe(false);
  });

  it("rejects invalid settings updates and persists overrides", async () => {
    const badPatch = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobspyResultsWanted: 9999 }),
    });
    expect(badPatch.status).toBe(400);

    const patchRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchTerms: ["engineer"],
        rxresumeEmail: "updated@example.com",
        llmApiKey: "updated-secret",
      }),
    });
    const patchBody = await patchRes.json();
    expect(patchBody.ok).toBe(true);
    expect(patchBody.data.searchTerms.value).toEqual(["engineer"]);
    expect(patchBody.data.searchTerms.override).toEqual(["engineer"]);
    expect(patchBody.data.rxresumeEmail).toBe("updated@example.com");
    expect(patchBody.data.llmApiKeyHint).toBe("upda");
  });

  it("validates basic auth requirements", async () => {
    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enableBasicAuth: true,
        basicAuthUser: "",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("Username is required");
  });

  it("handles salary penalty settings with validation", async () => {
    // Get initial settings
    const initialRes = await fetch(`${baseUrl}/api/settings`);
    const initialBody = await initialRes.json();
    expect(initialBody.ok).toBe(true);
    expect(initialBody.data.penalizeMissingSalary.value).toBe(false);
    expect(initialBody.data.missingSalaryPenalty.value).toBe(10);

    // Test invalid penalty values
    const invalidRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missingSalaryPenalty: 150 }),
    });
    expect(invalidRes.status).toBe(400);

    const negativeRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missingSalaryPenalty: -10 }),
    });
    expect(negativeRes.status).toBe(400);

    // Test valid settings update
    const validRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: true,
        missingSalaryPenalty: 20,
      }),
    });
    const validBody = await validRes.json();
    expect(validBody.ok).toBe(true);
    expect(validBody.data.penalizeMissingSalary.value).toBe(true);
    expect(validBody.data.penalizeMissingSalary.override).toBe(true);
    expect(validBody.data.missingSalaryPenalty.value).toBe(20);
    expect(validBody.data.missingSalaryPenalty.override).toBe(20);

    // Verify persistence
    const getRes = await fetch(`${baseUrl}/api/settings`);
    const getBody = await getRes.json();
    expect(getBody.ok).toBe(true);
    expect(getBody.data.penalizeMissingSalary.value).toBe(true);
    expect(getBody.data.missingSalaryPenalty.value).toBe(20);
  });

  it("preserves upstream 404 from Reactive Resume project lookup", async () => {
    const { RxResumeRequestError } = await import("@server/services/rxresume");
    vi.mocked(getResume).mockRejectedValue(
      new RxResumeRequestError(
        "Reactive Resume API error (404): Resume not found",
        404,
      ),
    );

    const res = await fetch(
      `${baseUrl}/api/settings/rx-resumes/missing/projects`,
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("404");
  });

  it("returns project catalog for v5-shaped Reactive Resume payloads", async () => {
    vi.mocked(getResume).mockResolvedValue({
      id: "resume-v5",
      name: "Resume v5",
      mode: "v5",
      data: {
        sections: {
          projects: {
            title: "Projects",
            columns: 1,
            hidden: false,
            items: [
              {
                id: "p1",
                hidden: false,
                name: "JobOps",
                period: "2024",
                website: { url: "https://example.com", label: "Example" },
                description: "Project description",
              },
            ],
          },
        },
        summary: {},
      },
    } as any);

    const res = await fetch(
      `${baseUrl}/api/settings/rx-resumes/resume-v5/projects?mode=v5`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.projects).toEqual([
      {
        id: "p1",
        name: "JobOps",
        description: "Project description",
        date: "2024",
        isVisibleInBase: true,
      },
    ]);
    expect(extractProjectsFromResume).toHaveBeenCalled();
  });
});

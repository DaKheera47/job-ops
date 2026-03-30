import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/services/rxresume", () => ({
  clearRxResumeResumeCache: vi.fn(),
  listResumes: vi.fn(),
  getResume: vi.fn(),
  validateCredentials: vi.fn(async () => ({
    ok: true,
    mode: "v5",
  })),
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
  validateCredentials,
} from "@server/services/rxresume";
import { getDefaultPromptTemplate } from "@shared/prompt-template-definitions.js";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Settings API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(validateCredentials).mockResolvedValue({
      ok: true,
      mode: "v5",
    });
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        LLM_API_KEY: "secret-key",
        RXRESUME_EMAIL: "resume@example.com",
        RXRESUME_URL: "https://env.rxresume.example.com",
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
    expect(body.data.rxresumeUrl).toBe("https://env.rxresume.example.com");
    expect(body.data.pdfRenderer.value).toBe("rxresume");
    expect(body.data.pdfRenderer.default).toBe("rxresume");
    expect(body.data.llmApiKeyHint).toBe("secr");
    expect(body.data.basicAuthActive).toBe(false);
    expect(body.data.ghostwriterSystemPromptTemplate.value).toBe(
      getDefaultPromptTemplate("ghostwriterSystemPromptTemplate"),
    );
    expect(body.data.tailoringPromptTemplate.value).toBe(
      getDefaultPromptTemplate("tailoringPromptTemplate"),
    );
    expect(body.data.scoringPromptTemplate.value).toBe(
      getDefaultPromptTemplate("scoringPromptTemplate"),
    );
  });

  it("normalizes hyphenated openai-compatible env defaults", async () => {
    const hyphenated = await startServer({
      env: {
        LLM_API_KEY: "secret-key",
        LLM_PROVIDER: "openai-compatible",
        RXRESUME_EMAIL: "resume@example.com",
      },
    });

    try {
      const res = await fetch(`${hyphenated.baseUrl}/api/settings`);
      const body = await res.json();

      expect(body.ok).toBe(true);
      expect(body.data.llmProvider.default).toBe("openai_compatible");
      expect(body.data.llmProvider.value).toBe("openai_compatible");
      expect(body.data.llmBaseUrl.default).toBe("https://api.openai.com");
    } finally {
      await stopServer(hyphenated);
    }
  });

  it("uses the provider default model when MODEL is unset", async () => {
    const openAiDefaults = await startServer({
      env: {
        MODEL: undefined,
        LLM_API_KEY: "secret-key",
        LLM_PROVIDER: "openai",
        RXRESUME_EMAIL: "resume@example.com",
      },
    });

    try {
      const res = await fetch(`${openAiDefaults.baseUrl}/api/settings`);
      const body = await res.json();

      expect(body.ok).toBe(true);
      expect(body.data.model.default).toBe("gpt-5.4-mini");
      expect(body.data.model.value).toBe("gpt-5.4-mini");
    } finally {
      await stopServer(openAiDefaults);
    }
  });

  it("updates the effective default model when llmProvider changes", async () => {
    const providerAware = await startServer({
      env: {
        MODEL: undefined,
        LLM_API_KEY: "secret-key",
        RXRESUME_EMAIL: "resume@example.com",
      },
    });

    try {
      const patchRes = await fetch(`${providerAware.baseUrl}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: "openai",
        }),
      });
      const patchBody = await patchRes.json();

      expect(patchRes.status).toBe(200);
      expect(patchBody.ok).toBe(true);
      expect(patchBody.data.llmProvider.value).toBe("openai");
      expect(patchBody.data.model.default).toBe("gpt-5.4-mini");
      expect(patchBody.data.model.value).toBe("gpt-5.4-mini");
    } finally {
      await stopServer(providerAware);
    }
  });

  it("ignores incompatible model overrides when the provider changes", async () => {
    const providerAware = await startServer({
      env: {
        MODEL: undefined,
        LLM_API_KEY: "secret-key",
        RXRESUME_EMAIL: "resume@example.com",
      },
    });

    try {
      const patchRes = await fetch(`${providerAware.baseUrl}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmProvider: "openai",
          modelTailoring: "google/gemini-3-flash-preview",
        }),
      });
      const patchBody = await patchRes.json();

      expect(patchRes.status).toBe(200);
      expect(patchBody.ok).toBe(true);
      expect(patchBody.data.model.default).toBe("gpt-5.4-mini");
      expect(patchBody.data.modelTailoring.value).toBe("gpt-5.4-mini");
      expect(patchBody.data.modelTailoring.override).toBeNull();
    } finally {
      await stopServer(providerAware);
    }
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
        pdfRenderer: "latex",
        searchTerms: ["engineer"],
        rxresumeEmail: "updated@example.com",
        rxresumeUrl: "https://resume.example.com",
        llmApiKey: "updated-secret",
        ghostwriterSystemPromptTemplate: "Custom Ghostwriter {{tone}}",
      }),
    });
    const patchBody = await patchRes.json();
    expect(patchBody.ok).toBe(true);
    expect(patchBody.data.pdfRenderer.value).toBe("latex");
    expect(patchBody.data.pdfRenderer.override).toBe("latex");
    expect(patchBody.data.searchTerms.value).toEqual(["engineer"]);
    expect(patchBody.data.searchTerms.override).toEqual(["engineer"]);
    expect(patchBody.data.rxresumeEmail).toBe("updated@example.com");
    expect(patchBody.data.rxresumeUrl).toBe("https://resume.example.com");
    expect(patchBody.data.llmApiKeyHint).toBe("upda");
    expect(patchBody.data.ghostwriterSystemPromptTemplate.override).toBe(
      "Custom Ghostwriter {{tone}}",
    );
  });

  it("blocks saving when the configured Reactive Resume v5 API key is invalid", async () => {
    vi.mocked(validateCredentials).mockResolvedValue({
      ok: false,
      mode: "v5",
      status: 401,
      message:
        "Reactive Resume v5 API key is invalid. Update the API key and try again.",
    });

    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rxresumeMode: "v5",
        rxresumeApiKey: "invalid-key",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(body.error.message).toContain("API key");

    const settingsRes = await fetch(`${baseUrl}/api/settings`);
    const settingsBody = await settingsRes.json();
    expect(settingsBody.data.rxresumeApiKeyHint).toBeNull();
  });

  it("blocks saving when Reactive Resume returns another 4xx validation failure", async () => {
    vi.mocked(validateCredentials).mockResolvedValue({
      ok: false,
      mode: "v5",
      status: 404,
      message:
        "Reactive Resume returned HTTP 404 from https://resume.example.com. Check the configured URL and selected mode.",
    });

    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rxresumeUrl: "https://resume.example.com",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");

    const settingsRes = await fetch(`${baseUrl}/api/settings`);
    const settingsBody = await settingsRes.json();
    expect(settingsBody.data.rxresumeUrl).toBe(
      "https://env.rxresume.example.com",
    );
  });

  it("allows saving when Reactive Resume is temporarily unavailable", async () => {
    vi.mocked(validateCredentials).mockResolvedValue({
      ok: false,
      mode: "v5",
      status: 0,
      message:
        "JobOps could not verify Reactive Resume because the instance is unavailable.",
    });

    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rxresumeMode: "v5",
        rxresumeApiKey: "rr-v5-warning-key",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.rxresumeApiKeyHint).toBe("rr-v");
  });

  it("does not run Reactive Resume validation for unrelated settings saves", async () => {
    vi.mocked(validateCredentials).mockResolvedValue({
      ok: false,
      mode: "v5",
      status: 401,
      message: "should not run",
    });

    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(validateCredentials).not.toHaveBeenCalled();
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

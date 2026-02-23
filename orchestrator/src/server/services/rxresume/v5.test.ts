import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleResume } from "./schema/v4";
import {
  deleteResume,
  exportResumePdf,
  fetchRxResume,
  getResume,
  importResume,
  listResumes,
} from "./v5";

function jsonResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe("rxresume v5 endpoints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("normalizes base URL and calls /api/openapi", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("RXRESUME_API_KEY", "test-key");

    await fetchRxResume("/resumes", {}, { baseUrl: "https://rxresu.me/api" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://rxresu.me/api/openapi/resumes",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "test-key" }),
      }),
    );
  });

  it("uses v5 get/list/import/delete/pdf endpoints", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({ id: "resume-123", name: "Resume", slug: "resume" }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "imported-123" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(
        jsonResponse({ url: "https://rxresu.me/storage/resume-123.pdf" }),
      );
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("RXRESUME_API_KEY", "test-key");

    await listResumes({ baseUrl: "https://rxresu.me" });
    await getResume("resume-123", { baseUrl: "https://rxresu.me" });
    await importResume(
      { data: sampleResume, name: "Imported Resume" },
      { baseUrl: "https://rxresu.me" },
    );
    await deleteResume("resume-123", { baseUrl: "https://rxresu.me" });
    await exportResumePdf("resume-123", { baseUrl: "https://rxresu.me" });

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://rxresu.me/api/openapi/resumes",
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://rxresu.me/api/openapi/resumes/resume-123",
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "https://rxresu.me/api/openapi/resumes/import",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      "https://rxresu.me/api/openapi/resumes/resume-123",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({}),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      5,
      "https://rxresu.me/api/openapi/resumes/resume-123/pdf",
      expect.any(Object),
    );
  });
});

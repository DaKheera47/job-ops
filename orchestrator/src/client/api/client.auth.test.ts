import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client";

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe("API client basic auth prompt flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.__resetApiClientAuthForTests();
  });

  afterEach(() => {
    api.__resetApiClientAuthForTests();
  });

  it("retries write requests with prompted credentials after unauthorized", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
          meta: { requestId: "req-1" },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          ok: true,
          data: { message: "ok" },
          meta: { requestId: "req-2" },
        }),
      );

    const promptHandler = vi
      .fn()
      .mockResolvedValue({ username: "user", password: "pass" });
    api.setBasicAuthPromptHandler(promptHandler);

    await expect(api.runPipeline()).resolves.toEqual({ message: "ok" });
    expect(promptHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/pipeline/run",
        method: "POST",
        attempt: 1,
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const retryHeaders = fetchSpy.mock.calls[1]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(retryHeaders.Authorization).toMatch(/^Basic /);
  });

  it("reuses cached credentials for later write requests", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
          meta: { requestId: "req-1" },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          ok: true,
          data: { message: "first" },
          meta: { requestId: "req-2" },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          ok: true,
          data: { message: "second" },
          meta: { requestId: "req-3" },
        }),
      );

    const promptHandler = vi
      .fn()
      .mockResolvedValue({ username: "user", password: "pass" });
    api.setBasicAuthPromptHandler(promptHandler);

    await expect(api.runPipeline()).resolves.toEqual({ message: "first" });
    await expect(api.runPipeline()).resolves.toEqual({ message: "second" });

    expect(promptHandler).toHaveBeenCalledTimes(1);
    const secondRequestHeaders = fetchSpy.mock.calls[2]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(secondRequestHeaders.Authorization).toMatch(/^Basic /);
  });

  it("throws unauthorized when the prompt is cancelled", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(401, {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        meta: { requestId: "req-1" },
      }),
    );
    api.setBasicAuthPromptHandler(vi.fn().mockResolvedValue(null));

    await expect(api.runPipeline()).rejects.toThrow("Authentication required");
  });
});

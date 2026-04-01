import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client";

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response;
}

/** Mock response for a failed JWT login attempt (server doesn't support it or returns error). */
const JWT_LOGIN_FAIL = createJsonResponse(400, {
  ok: false,
  error: { code: "INVALID_REQUEST", message: "Authentication is not enabled" },
});

/** Mock response for a successful JWT login attempt. */
function jwtLoginSuccess() {
  return createJsonResponse(200, {
    ok: true,
    data: { token: "mock-jwt-token", expiresIn: 86400 },
  });
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
      // 1. Original request → 401
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
          meta: { requestId: "req-1" },
        }),
      )
      // 2. JWT login attempt → success
      .mockResolvedValueOnce(jwtLoginSuccess())
      // 3. Retry with JWT → success
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
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const retryHeaders = fetchSpy.mock.calls[2]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(retryHeaders.Authorization).toMatch(/^Bearer /);
  });

  it("retries read requests with prompted credentials after unauthorized", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      // 1. Original request → 401
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
          meta: { requestId: "req-1" },
        }),
      )
      // 2. JWT login attempt → success
      .mockResolvedValueOnce(jwtLoginSuccess())
      // 3. Retry with JWT → success
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          ok: true,
          data: {
            jobs: [],
            total: 0,
            page: 1,
            pageSize: 0,
            totalPages: 1,
          },
          meta: { requestId: "req-2" },
        }),
      );

    const promptHandler = vi
      .fn()
      .mockResolvedValue({ username: "user", password: "pass" });
    api.setBasicAuthPromptHandler(promptHandler);

    await expect(api.getJobs({ view: "list" })).resolves.toMatchObject({
      jobs: [],
      total: 0,
    });
    expect(promptHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/jobs?view=list",
        method: "GET",
        attempt: 1,
      }),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const retryHeaders = fetchSpy.mock.calls[2]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(retryHeaders.Authorization).toMatch(/^Bearer /);
  });

  it("reuses cached credentials for later write requests", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      // 1. First request → 401
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
          meta: { requestId: "req-1" },
        }),
      )
      // 2. JWT login → success
      .mockResolvedValueOnce(jwtLoginSuccess())
      // 3. Retry first request → success
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          ok: true,
          data: { message: "first" },
          meta: { requestId: "req-2" },
        }),
      )
      // 4. Second request uses cached JWT → success
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
    const secondRequestHeaders = fetchSpy.mock.calls[3]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(secondRequestHeaders.Authorization).toMatch(/^Bearer /);
  });

  it("reuses cached credentials for later read requests", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      // 1. First request → 401
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
          meta: { requestId: "req-1" },
        }),
      )
      // 2. JWT login → success
      .mockResolvedValueOnce(jwtLoginSuccess())
      // 3. Retry first request → success
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          ok: true,
          data: {
            jobs: [],
            total: 0,
            page: 1,
            pageSize: 0,
            totalPages: 1,
          },
          meta: { requestId: "req-2" },
        }),
      )
      // 4. Second request uses cached JWT → success
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          ok: true,
          data: {
            jobs: [],
            total: 0,
            page: 1,
            pageSize: 0,
            totalPages: 1,
          },
          meta: { requestId: "req-3" },
        }),
      );

    const promptHandler = vi
      .fn()
      .mockResolvedValue({ username: "user", password: "pass" });
    api.setBasicAuthPromptHandler(promptHandler);

    await expect(api.getJobs({ view: "list" })).resolves.toMatchObject({
      jobs: [],
      total: 0,
    });
    await expect(api.getJobs({ view: "list" })).resolves.toMatchObject({
      jobs: [],
      total: 0,
    });

    expect(promptHandler).toHaveBeenCalledTimes(1);
    const secondRequestHeaders = fetchSpy.mock.calls[3]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(secondRequestHeaders.Authorization).toMatch(/^Bearer /);
  });

  it("falls back to Basic Auth when JWT login fails", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      // 1. Original request → 401
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
          meta: { requestId: "req-1" },
        }),
      )
      // 2. JWT login attempt → fail
      .mockResolvedValueOnce(JWT_LOGIN_FAIL)
      // 3. Retry with Basic Auth → success
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
    const retryHeaders = fetchSpy.mock.calls[2]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(retryHeaders.Authorization).toMatch(/^Basic /);
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

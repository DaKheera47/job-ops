import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client";

const { redirectToSignIn } = vi.hoisted(() => ({
  redirectToSignIn: vi.fn(),
}));

vi.mock("@client/lib/auth-navigation", () => ({
  redirectToSignIn,
}));

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response;
}

function jwtLoginSuccess(token = "mock-jwt-token") {
  return createJsonResponse(200, {
    ok: true,
    data: { token, expiresIn: 86400 },
  });
}

describe("API client auth flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redirectToSignIn.mockReset();
    api.__resetApiClientAuthForTests();
  });

  afterEach(() => {
    api.__resetApiClientAuthForTests();
  });

  it("silently upgrades legacy stored credentials after an unauthorized response", async () => {
    api.__setLegacyAuthCredentialsForTests({
      username: "user",
      password: "pass",
    });

    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
          meta: { requestId: "req-1" },
        }),
      )
      .mockResolvedValueOnce(jwtLoginSuccess())
      .mockResolvedValueOnce(
        createJsonResponse(200, {
          ok: true,
          data: { message: "ok" },
          meta: { requestId: "req-2" },
        }),
      );

    await expect(api.runPipeline()).resolves.toEqual({ message: "ok" });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer mock-jwt-token",
      }),
    });
    expect(redirectToSignIn).not.toHaveBeenCalled();
  });

  it("clears legacy stored credentials before attempting migration", async () => {
    api.__setLegacyAuthCredentialsForTests({
      username: "user",
      password: "pass",
    });

    vi.spyOn(global, "fetch").mockResolvedValueOnce(jwtLoginSuccess());

    const storedBefore = sessionStorage.getItem("jobops.basicAuthCredentials");
    expect(storedBefore).toContain('"password"');

    const promise = api.restoreAuthSessionFromLegacyCredentials();
    expect(sessionStorage.getItem("jobops.basicAuthCredentials")).toBeNull();
    await expect(promise).resolves.toBe(true);
  });

  it("reuses the upgraded bearer token on later requests", async () => {
    api.__setLegacyAuthCredentialsForTests({
      username: "user",
      password: "pass",
    });

    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        createJsonResponse(401, {
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
          meta: { requestId: "req-1" },
        }),
      )
      .mockResolvedValueOnce(jwtLoginSuccess("reused-token"))
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

    await expect(api.runPipeline()).resolves.toEqual({ message: "first" });
    await expect(api.runPipeline()).resolves.toEqual({ message: "second" });

    expect(fetchSpy.mock.calls[3]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: "Bearer reused-token",
      }),
    });
    expect(redirectToSignIn).not.toHaveBeenCalled();
  });

  it("redirects to sign-in when unauthorized and no recoverable credentials exist", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(401, {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
        meta: { requestId: "req-1" },
      }),
    );

    await expect(api.runPipeline()).rejects.toThrow("Authentication required");
    expect(redirectToSignIn).toHaveBeenCalledTimes(1);
  });

  it("stores a bearer token when signing in directly", async () => {
    api.__setLegacyAuthCredentialsForTests({
      username: "legacy-user",
      password: "legacy-pass",
    });

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      jwtLoginSuccess("fresh-token"),
    );

    await expect(
      api.signInWithCredentials("legacy-user", "legacy-pass"),
    ).resolves.toBeUndefined();
    expect(api.getCachedAuthHeader()).toBe("Bearer fresh-token");
  });

  it("redirects after logout and clears the cached token", async () => {
    api.__setAuthTokenForTests("logout-token");

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: { message: "Logged out" },
        meta: { requestId: "req-1" },
      }),
    );

    await api.logout();

    expect(api.getCachedAuthHeader()).toBeUndefined();
    expect(redirectToSignIn).toHaveBeenCalledTimes(1);
  });

  it("sends the full automatic run payload to the pipeline API", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    fetchSpy.mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: { message: "ok" },
        meta: { requestId: "req-full" },
      }),
    );

    await expect(
      api.runPipeline({
        topN: 12,
        minSuitabilityScore: 55,
        runBudget: 150,
        searchTerms: ["backend engineer"],
        country: "united kingdom",
        cityLocations: ["London"],
        workplaceTypes: ["remote", "hybrid"],
        searchScope: "selected_plus_remote_worldwide",
        matchStrictness: "flexible",
        sources: ["linkedin"],
      }),
    ).resolves.toEqual({ message: "ok" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/pipeline/run",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          topN: 12,
          minSuitabilityScore: 55,
          runBudget: 150,
          searchTerms: ["backend engineer"],
          country: "united kingdom",
          cityLocations: ["London"],
          workplaceTypes: ["remote", "hybrid"],
          searchScope: "selected_plus_remote_worldwide",
          matchStrictness: "flexible",
          sources: ["linkedin"],
        }),
      }),
    );
  });
});

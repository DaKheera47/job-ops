import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPersistedFetchCookieJar, readCookieJar } from "browser-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { solveWithCapsolver } from "./capsolver";

const mock = vi.hoisted(() => ({
  pageFetch: vi.fn(),
  apiFetch: vi.fn(),
  wait: vi.fn(),
}));
vi.mock("browser-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("browser-utils")>()),
  createCloudflareFetch: vi.fn(async () => mock.pageFetch),
}));
vi.mock("node:timers/promises", () => ({
  setTimeout: mock.wait,
  default: { setTimeout: mock.wait },
}));

const solution = {
  errorId: 0,
  status: "ready",
  taskId: "task-1",
  solution: {
    cookies: { cf_clearance: "clearance", unrelated: "discard" },
    userAgent: "Mozilla/5.0 Chrome/141.0.0.0",
  },
};

describe("CapSolver Cloudflare API", () => {
  let dir: string;
  const args = () => ({
    extractorId: "gradcracker",
    url: "https://www.gradcracker.com/search/jobs",
    storageDir: dir,
    signal: new AbortController().signal,
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "jobops-capsolver-"));
    vi.stubEnv("CAPSOLVER_API_KEY", " private-key ");
    vi.stubEnv("CAPSOLVER_PROXY", "http://user:secret@proxy.example:8080");
    vi.stubGlobal("fetch", mock.apiFetch);
    mock.apiFetch.mockReset();
    mock.pageFetch
      .mockReset()
      .mockResolvedValue(
        new Response("<title>Just a moment...</title>", { status: 403 }),
      );
    mock.wait
      .mockReset()
      .mockImplementation(async (_ms, _value, options) =>
        options.signal.throwIfAborted(),
      );
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it("creates and polls a full-page task, then persists the returned cookies and UA for this workspace", async () => {
    mock.apiFetch
      .mockResolvedValueOnce(
        Response.json({ errorId: 0, taskId: "task-1", status: "idle" }),
      )
      .mockResolvedValueOnce(
        Response.json({ errorId: 0, status: "processing" }),
      )
      .mockResolvedValueOnce(Response.json(solution));
    await solveWithCapsolver(args());
    expect(JSON.parse(mock.apiFetch.mock.calls[0][1].body)).toEqual({
      clientKey: "private-key",
      task: {
        type: "AntiCloudflareTask",
        websiteURL: args().url,
        proxy: "http://user:secret@proxy.example:8080/",
        html: "<title>Just a moment...</title>",
      },
    });
    expect(mock.apiFetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.capsolver.com/createTask",
      "https://api.capsolver.com/getTaskResult",
      "https://api.capsolver.com/getTaskResult",
    ]);
    expect(JSON.parse(mock.apiFetch.mock.calls[1][1].body)).toEqual({
      clientKey: "private-key",
      taskId: "task-1",
    });
    expect(await readCookieJar("gradcracker", dir)).toMatchObject({
      hasClearanceCookie: true,
      cookieCount: 1,
      userAgent: solution.solution.userAgent,
    });
    const jar = await createPersistedFetchCookieJar("gradcracker", dir);
    expect(await jar.cookieJar.getCookieString(args().url)).toBe(
      "cf_clearance=clearance",
    );
    expect(await jar.cookieJar.getCookieString("https://hiringcafe.com/")).toBe(
      "",
    );
    expect(
      await readCookieJar("gradcracker", join(dir, "another-workspace")),
    ).toMatchObject({ hasCookies: false });
  });

  it.each([
    [
      {
        errorId: 1,
        errorCode: "ERROR_KEY_DENIED_ACCESS",
        errorDescription: "private-key secret",
      },
      401,
      "rejected CAPSOLVER_API_KEY",
    ],
    [
      {
        errorId: 1,
        errorCode: "ERROR_ZERO_BALANCE",
        errorDescription: "private-key secret",
      },
      400,
      "insufficient balance",
    ],
    [
      {
        errorId: 1,
        errorCode: "ERROR_PROXY_BANNED",
        errorDescription: "private-key secret",
      },
      400,
      "blocked CAPSOLVER_PROXY",
    ],
    [
      {
        errorId: 1,
        errorCode: "unknown-private-key",
        errorDescription: "secret",
      },
      200,
      "could not solve",
    ],
    [
      {
        errorId: 0,
        taskId: "task-1",
        status: "ready",
        solution: { cookies: {}, userAgent: "Chrome/141" },
      },
      200,
      "could not solve",
    ],
  ])("reports controlled errors without leaking upstream payloads", async (body, status, message) => {
    mock.apiFetch.mockResolvedValue(Response.json(body, { status }));
    const error = await solveWithCapsolver(args()).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(message);
    expect((error as Error).message).not.toMatch(/private-key|secret/);
    expect(await readCookieJar("gradcracker", dir)).toMatchObject({
      hasCookies: false,
    });
  });

  it("requires a proxy and rejects unsupported URLs before making external requests", async () => {
    vi.stubEnv("CAPSOLVER_PROXY", "");
    await expect(solveWithCapsolver(args())).rejects.toThrow("CAPSOLVER_PROXY");
    vi.stubEnv("CAPSOLVER_PROXY", "http://proxy.example:8080");
    await expect(
      solveWithCapsolver({ ...args(), url: "https://example.com/private" }),
    ).rejects.toThrow("not supported");
    expect(mock.apiFetch).not.toHaveBeenCalled();
    expect(mock.pageFetch).not.toHaveBeenCalled();
  });

  it("does not spend on unsupported Vercel checks", async () => {
    mock.pageFetch.mockResolvedValue(
      new Response("Vercel Security Checkpoint"),
    );
    await expect(solveWithCapsolver(args())).rejects.toThrow("Vercel");
    expect(mock.apiFetch).not.toHaveBeenCalled();
  });

  it("aborts an in-flight API request when cancelled", async () => {
    mock.apiFetch.mockImplementation(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(new Error("private-key secret")),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const result = solveWithCapsolver({ ...args(), signal: controller.signal });
    const assertion = expect(result).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(mock.apiFetch).toHaveBeenCalledOnce());
    controller.abort();
    await assertion;
    expect(mock.apiFetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("bounds a hung API call to two minutes", async () => {
    vi.useFakeTimers();
    mock.apiFetch.mockImplementation(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const assertion = expect(solveWithCapsolver(args())).rejects.toThrow(
      "timed out",
    );
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
  });
});

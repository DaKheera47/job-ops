import { saveClearanceCookies } from "browser-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { solveWithCapsolver } from "./capsolver";

const mock = vi.hoisted(() => ({
  fetch: vi.fn(),
  page: vi.fn(),
  save: vi.fn(),
}));
vi.mock("browser-utils", async (original) => ({
  ...(await original<typeof import("browser-utils")>()),
  createCloudflareFetch: vi.fn(async () => mock.page),
  saveClearanceCookies: mock.save,
}));
vi.mock("node:timers/promises", () => ({
  setTimeout: async () => undefined,
  default: { setTimeout: async () => undefined },
}));
const args = {
  extractorId: "gradcracker",
  url: "https://www.gradcracker.com/search/jobs",
  storageDir: "/private/workspace/cookies",
  signal: new AbortController().signal,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CAPSOLVER_API_KEY", "private-key");
  vi.stubEnv("CAPSOLVER_PROXY", "http://user:secret@proxy.example:8080");
  vi.stubGlobal("fetch", mock.fetch);
  mock.page.mockResolvedValue(
    new Response("Just a moment...", { status: 403 }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("solves through CapSolver and saves clearance for the workspace retry", async () => {
  const solution = {
    cookies: { cf_clearance: "clearance" },
    userAgent: "Chrome/141.0",
  };
  mock.fetch
    .mockReset()
    .mockResolvedValueOnce(
      Response.json({ errorId: 0, taskId: "task-1", status: "idle" }),
    )
    .mockResolvedValueOnce(
      Response.json({ errorId: 0, status: "ready", solution }),
    );
  await solveWithCapsolver(args);
  expect(mock.fetch).toHaveBeenCalledTimes(2);
  expect(saveClearanceCookies).toHaveBeenCalledWith(
    args.extractorId,
    args.url,
    solution.cookies,
    solution.userAgent,
    args.storageDir,
  );
});

it("reports upstream failure without exposing credentials or saving a solution", async () => {
  mock.fetch.mockReset().mockResolvedValue(
    Response.json(
      {
        errorId: 1,
        errorCode: "ERROR_ZERO_BALANCE",
        errorDescription: "private-key user:secret",
      },
      { status: 400 },
    ),
  );
  await expect(solveWithCapsolver(args)).rejects.toThrow(
    "CapSolver has insufficient balance.",
  );
  expect(saveClearanceCookies).not.toHaveBeenCalled();
});

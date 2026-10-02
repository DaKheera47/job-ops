import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const page = {
    goto: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => "Mozilla/5.0 Test"),
  };
  const context = {
    newPage: vi.fn(async () => page),
    pages: vi.fn(() => [page]),
    cookies: vi.fn(async () => [] as Array<Record<string, unknown>>),
  };
  const browser = {
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => undefined),
  };
  return { page, context, browser, isChallengePage: vi.fn(async () => false) };
});

vi.mock("playwright", () => ({
  firefox: { launch: vi.fn(async () => mock.browser) },
}));
vi.mock("../src/launch.js", () => ({
  createLaunchOptions: vi.fn(async () => ({ launchOptions: {} })),
}));
vi.mock("../src/challenge.js", () => ({
  isChallengePage: mock.isChallengePage,
}));

import { solveChallenge } from "../src/solver.js";

describe("solveChallenge", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "job-ops-solver-test-"));
    vi.clearAllMocks();
    mock.isChallengePage.mockResolvedValue(false);
    mock.context.cookies.mockResolvedValue([]);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("does not report a solve or update an old jar when no clearance cookie was issued", async () => {
    const path = join(dir, "hiringcafe-cookies.json");
    const oldJar = JSON.stringify({ savedAt: "yesterday", cookies: [] });
    await writeFile(path, oldJar);

    const result = await solveChallenge(
      "https://hiringcafe.com/job/req-1",
      "hiringcafe",
      dir,
    );

    expect(result).toMatchObject({
      status: "error",
      message: expect.stringContaining("no reusable Cloudflare clearance"),
    });
    expect(await readFile(path, "utf8")).toBe(oldJar);
    expect(mock.browser.close).toHaveBeenCalledOnce();
  });

  it("reports success when the initially clear page provides a reusable cookie", async () => {
    mock.context.cookies.mockResolvedValue([
      {
        name: "cf_clearance",
        value: "test-clearance",
        domain: ".hiringcafe.com",
        path: "/",
        expires: Date.now() / 1000 + 3600,
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
    ]);

    const result = await solveChallenge(
      "https://hiringcafe.com/job/req-1",
      "hiringcafe",
      dir,
    );

    expect(result).toEqual({ status: "solved", cookiesSaved: 1 });
    expect(
      await readFile(join(dir, "hiringcafe-cookies.json"), "utf8"),
    ).toContain("cf_clearance");
  });

  it("does not accept an unchanged saved clearance cookie as a new solve", async () => {
    const cookie = {
      name: "cf_clearance",
      value: "saved-clearance",
      domain: ".hiringcafe.com",
      path: "/",
      expires: Date.now() / 1000 + 3600,
      httpOnly: true,
      secure: true,
      sameSite: "None",
    };
    await writeFile(
      join(dir, "hiringcafe-cookies.json"),
      JSON.stringify({
        extractorId: "hiringcafe",
        savedAt: new Date().toISOString(),
        cookies: [cookie],
        userAgent: "Mozilla/5.0 Saved",
      }),
    );
    const result = await solveChallenge(
      "https://hiringcafe.com/job/req-1",
      "hiringcafe",
      dir,
    );

    expect(result).toMatchObject({
      status: "error",
      message: expect.stringContaining("no reusable Cloudflare clearance"),
    });
    expect(mock.browser.newContext).toHaveBeenCalledWith();
    expect(mock.context.cookies).toHaveBeenCalled();
    expect(
      await readFile(join(dir, "hiringcafe-cookies.json"), "utf8"),
    ).toContain("saved-clearance");
  });
});

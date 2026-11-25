// @vitest-environment node

import { type LookupAddress, lookup } from "node:dns";
import type { LookupFunction } from "node:net";
import { Agent, fetch, Response } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchManualJobPage } from "./manualJobPage";

vi.mock("node:dns", () => ({ lookup: vi.fn<LookupFunction>() }));
vi.mock("undici", { spy: true });

const url = "https://jobs.example/role";
const publicAddresses = [
  { address: "93.184.216.34", family: 4 },
  { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
];

function resolveAs(addresses: LookupAddress[]) {
  vi.mocked<LookupFunction>(lookup).mockImplementation(
    (_hostname, _options, callback) => {
      callback(null, addresses, 0);
    },
  );
}

function mockConnection(response: Response, all: boolean) {
  vi.mocked(fetch).mockImplementationOnce(async (input, options) => {
    const connect = vi.mocked(Agent).mock.calls[0]?.[0]?.connect;
    if (
      !connect ||
      typeof connect !== "object" ||
      !("lookup" in connect) ||
      !connect.lookup
    ) {
      throw new Error("Expected a socket lookup policy");
    }
    const socketLookup = connect.lookup;
    const addresses = await new Promise((resolve, reject) => {
      socketLookup(
        new URL(String(input)).hostname,
        { all },
        (error, result) => {
          if (error) reject(new TypeError("fetch failed", { cause: error }));
          else resolve(result);
        },
      );
    });
    expect(addresses).toEqual(
      all ? publicAddresses : publicAddresses[0].address,
    );
    expect(options).toMatchObject({ dispatcher: expect.any(Agent) });
    return response;
  });
}

describe("manual job page fetch", () => {
  let signal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();
    signal = new AbortController().signal;
    vi.mocked(fetch).mockReset().mockRejectedValue(new Error("Unmocked fetch"));
    resolveAs(publicAddresses);
  });

  it.each([
    true,
    false,
  ])("hands vetted DNS answers to the socket (all=%s)", async (all) => {
    mockConnection(new Response("<main>Public job</main>"), all);

    await expect(fetchManualJobPage(url, signal)).resolves.toContain(
      "Public job",
    );
    expect(lookup).toHaveBeenCalledWith(
      "jobs.example",
      { all: true },
      expect.any(Function),
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL(url),
      expect.objectContaining({ redirect: "manual", signal }),
    );
  });

  it.each([
    { address: "10.0.0.1", family: 4 },
    { address: "100.64.0.1", family: 4 },
    { address: "169.254.0.1", family: 4 },
    { address: "192.0.2.1", family: 4 },
    { address: "::1", family: 6 },
    { address: "::ffff:192.168.0.1", family: 6 },
    { address: "fc00::1", family: 6 },
    { address: "fe80::1", family: 6 },
    { address: "2001:db8::1", family: 6 },
  ])("rejects a DNS result containing $address", async (address) => {
    resolveAs([...publicAddresses, address]);
    mockConnection(new Response("unused"), true);

    await expect(fetchManualJobPage(url, signal)).rejects.toMatchObject({
      code: "UNPROCESSABLE_ENTITY",
    });
  });

  it.each([
    "ftp://jobs.example/role",
    "https://user:password@jobs.example/role",
    "http://127.0.0.1/role",
    "http://[::1]/role",
  ])("rejects an unsupported URL before dispatch", async (input) => {
    await expect(fetchManualJobPage(input, signal)).rejects.toMatchObject({
      code: "UNPROCESSABLE_ENTITY",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows relative redirects and checks the next hostname's answers", async () => {
    mockConnection(
      new Response("redirect", {
        status: 302,
        headers: { location: "/new-role" },
      }),
      true,
    );
    mockConnection(
      new Response(null, {
        status: 307,
        headers: { location: "http://careers.example/role" },
      }),
      true,
    );
    mockConnection(new Response("Role description"), true);

    await expect(fetchManualJobPage(url, signal)).resolves.toBe(
      "Role description",
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      new URL("https://jobs.example/new-role"),
      expect.anything(),
    );
    expect(lookup).toHaveBeenLastCalledWith(
      "careers.example",
      { all: true },
      expect.any(Function),
    );
  });

  it("rejects a redirect when the next hostname resolves to a nonpublic address", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://careers.example/role" },
      }),
    );
    resolveAs([{ address: "10.0.0.1", family: 4 }]);
    mockConnection(new Response("unused"), true);

    await expect(fetchManualJobPage(url, signal)).rejects.toMatchObject({
      code: "UNPROCESSABLE_ENTITY",
    });
    expect(lookup).toHaveBeenCalledWith(
      "careers.example",
      { all: true },
      expect.any(Function),
    );
  });

  it("checks a redirect to a literal before dispatching it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/role" },
      }),
    );

    await expect(fetchManualJobPage(url, signal)).rejects.toMatchObject({
      code: "UNPROCESSABLE_ENTITY",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds the number of redirects", async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(null, { status: 302, headers: { location: "/role" } }),
    );

    await expect(fetchManualJobPage(url, signal)).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: expect.stringContaining("redirects too many times"),
    });
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("bounds streamed response bytes", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Uint8Array(2 * 1024 * 1024 + 1)),
    );

    await expect(fetchManualJobPage(url, signal)).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: expect.stringContaining("too large"),
    });
  });

  it("keeps upstream status guidance and omits response bodies", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("private upstream detail", { status: 403 }),
    );

    await expect(fetchManualJobPage(url, signal)).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: expect.stringContaining("blocks automated fetch"),
      details: { upstreamStatus: 403 },
    });
  });

  it("returns a generic upstream error for network failures", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("private network detail"));

    await expect(fetchManualJobPage(url, signal)).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message:
        "Couldn't fetch this URL automatically. Paste the job description manually.",
    });
  });

  it("returns the request timeout when the shared signal aborts", async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation(async () => {
      controller.abort();
      throw controller.signal.reason;
    });

    await expect(
      fetchManualJobPage(url, controller.signal),
    ).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
  });
});

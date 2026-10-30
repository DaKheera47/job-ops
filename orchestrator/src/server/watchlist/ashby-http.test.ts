// @vitest-environment node
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { type RequestOptions, request } from "node:https";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPublicAddress,
  parsePublicAshbyPageUrl,
  readPublicAshbyUrl,
} from "./ashby-http";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));

const dns = vi.mocked(
  lookup as (
    hostname: string,
    options: { all: true },
  ) => Promise<LookupAddress[]>,
);
const publicIp = "93.184.216.34";
const options = { accept: "text/html", maxBytes: 20 };
function readPage(
  overrides: Partial<typeof options> & { signal?: AbortSignal } = {},
) {
  return readPublicAshbyUrl("https://company.example", {
    ...options,
    ...overrides,
  });
}
let status: number;
let headers: Record<string, string>;
let body: string;

describe("Ashby public HTTPS transport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    status = 200;
    headers = { "content-type": "text/html" };
    body = "<p>OK</p>";
    dns.mockResolvedValue([{ address: publicIp, family: 4 }]);
    vi.mocked(request).mockImplementation(((
      _url: URL,
      _opts: RequestOptions,
      callback: (res: IncomingMessage) => void,
    ) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () =>
        queueMicrotask(() => {
          const res = Readable.from([Buffer.from(body)]) as IncomingMessage;
          res.statusCode = status;
          res.headers = headers;
          callback(res);
        });
      return req;
    }) as typeof request);
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "100.64.1.1",
    "192.168.1.1",
    "192.0.2.1",
    "198.18.1.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fd00::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "2001::1",
  ])("rejects non-public DNS address %s", async (address) => {
    expect(isPublicAddress(address)).toBe(false);
    dns.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
    await expect(readPage()).rejects.toThrow("only to public");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    publicIp,
    "8.8.8.8",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("accepts public address %s", (address) =>
    expect(isPublicAddress(address)).toBe(true));
  it.each([
    "https://127.1/careers",
    "https://2130706433/careers",
    "https://[::1]/",
    "https://user:secret@public.example/",
    "http://public.example/",
    "https://public.example:8443/",
    "https://localhost/",
    "https://host.local/",
  ])("rejects unsafe input URL %s", (url) =>
    expect(() => parsePublicAshbyPageUrl(url)).toThrow());
  it("pins the vetted address at connection time, with no cookies or authorization", async () => {
    await expect(readPage()).resolves.toMatchObject({ text: body });
    const args = vi.mocked(request).mock.calls[0];
    const opts = args[1] as RequestOptions;
    const callback = vi.fn();
    const pinnedLookup = opts.lookup as (
      hostname: string,
      options: object,
      cb: typeof callback,
    ) => void;
    pinnedLookup("company.example", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, publicIp, 4);
    expect(opts.headers).toEqual({
      accept: "text/html",
      "accept-encoding": "identity",
      "user-agent": expect.any(String),
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("rejects mixed public and private DNS answers", async () => {
    dns.mockResolvedValue([
      { address: publicIp, family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(readPage()).rejects.toThrow("only to public");
  });
  it("revalidates redirect URLs before making another request", async () => {
    status = 302;
    headers.location = "https://127.0.0.1/admin";
    await expect(readPage()).rejects.toThrow("public HTTPS");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("bounds redirects", async () => {
    status = 302;
    headers.location = "https://company.example/again";
    await expect(readPage()).rejects.toThrow("too many");
    expect(request).toHaveBeenCalledTimes(6);
  });
  it("enforces the stream size limit without Content-Length", async () => {
    await expect(readPage({ maxBytes: 3 })).rejects.toThrow("supported size");
  });
  it("rejects oversized declared bodies and unexpected compressed content", async () => {
    headers["content-length"] = "1000000000";
    await expect(readPage()).rejects.toThrow("supported size");
    delete headers["content-length"];
    headers["content-encoding"] = "gzip";
    await expect(readPage()).rejects.toThrow("encoding");
  });
  it("checks content type", async () => {
    headers["content-type"] = "application/octet-stream";
    await expect(readPage()).rejects.toThrow("content type");
  });
  it("returns a status-only error without the upstream body", async () => {
    status = 404;
    body = "secret upstream diagnostic";
    await expect(readPage()).rejects.toThrow(
      /^Ashby careers request failed with HTTP 404\.$/,
    );
  });
  it("does not retry earlier than Retry-After", async () => {
    status = 429;
    headers["retry-after"] = "120";
    await expect(readPage()).rejects.toThrow("HTTP 429");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("honors cancellation while DNS is pending", async () => {
    dns.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const pending = readPage({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

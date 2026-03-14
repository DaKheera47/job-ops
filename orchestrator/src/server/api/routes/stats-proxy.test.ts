import type { Server } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Stats proxy routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServer({ server, closeDb, tempDir });
  });

  it("proxies the umami script through the first-party stats route", async () => {
    const realFetch = global.fetch;
    const mockFetch = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "https://umami.dakheera47.com/script.js") {
          expect(init?.method).toBe("GET");
          return new Response(gzipSync("console.log('umami')"), {
            status: 200,
            headers: {
              "content-type": "application/javascript; charset=utf-8",
              "cache-control": "public, max-age=60",
              "content-encoding": "gzip",
            },
          });
        }
        return realFetch(input, init);
      },
    );
    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(`${baseUrl}/stats/script.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(await response.text()).toContain("umami");
  });

  it("forwards tracking requests to the umami upstream", async () => {
    const realFetch = global.fetch;
    const mockFetch = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "https://umami.dakheera47.com/api/send?foo=bar") {
          expect(init?.method).toBe("POST");
          expect(init?.headers).toBeInstanceOf(Headers);
          const headers = init?.headers as Headers;
          expect(headers.get("content-type")).toBe("application/json");
          expect(headers.get("authorization")).toBeNull();
          expect(headers.get("cookie")).toBeNull();
          expect(headers.get("x-forwarded-for")).toBeNull();
          const normalizedBody = init?.body
            ? await new Response(init.body as BodyInit).text()
            : "";
          expect(normalizedBody).toBe('{"type":"event"}');
          return new Response(null, { status: 202 });
        }
        return realFetch(input, init);
      },
    );
    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(`${baseUrl}/stats/api/send?foo=bar`, {
      method: "POST",
      headers: {
        authorization: "Basic abc123",
        cookie: "session=secret",
        "content-type": "application/json",
        "x-forwarded-for": "10.0.0.1",
      },
      body: JSON.stringify({ type: "event" }),
    });

    expect(response.status).toBe(202);
  });

  it("returns 404 for non-allowlisted stats routes", async () => {
    const realFetch = global.fetch;
    const mockFetch = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) =>
        realFetch(input, init),
    );
    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(`${baseUrl}/stats`);

    expect(response.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalledWith(
      "https://umami.dakheera47.com/",
      expect.anything(),
    );
  });

  it("returns 405 for unsupported methods on allowlisted stats routes", async () => {
    const realFetch = global.fetch;
    const mockFetch = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) =>
        realFetch(input, init),
    );
    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(`${baseUrl}/stats/script.js`, {
      method: "POST",
      body: "unexpected",
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(await response.text()).toBe("Method not allowed");
    expect(mockFetch).not.toHaveBeenCalledWith(
      "https://umami.dakheera47.com/script.js",
      expect.anything(),
    );
  });

  it("returns a sanitized upstream failure response", async () => {
    const realFetch = global.fetch;
    const mockFetch = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "https://umami.dakheera47.com/script.js") {
          throw new Error("upstream down");
        }
        return realFetch(input, init);
      },
    );
    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(`${baseUrl}/stats/script.js`);

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Upstream error");
  });

  it("returns 504 when the umami upstream times out", async () => {
    const realFetch = global.fetch;
    const mockFetch = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "https://umami.dakheera47.com/script.js") {
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The operation timed out", "TimeoutError"),
              );
            });
          });
        }
        return realFetch(input, init);
      },
    );
    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(`${baseUrl}/stats/script.js`);

    expect(response.status).toBe(504);
    expect(await response.text()).toBe("Upstream timeout");
  });

  it("allows stats proxy requests when basic auth is enabled", async () => {
    await stopServer({ server, closeDb, tempDir });
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        BASIC_AUTH_USER: "admin",
        BASIC_AUTH_PASSWORD: "secret",
      },
    }));

    const realFetch = global.fetch;
    const mockFetch = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "https://umami.dakheera47.com/script.js") {
          return new Response("ok", {
            status: 200,
            headers: { "content-type": "application/javascript" },
          });
        }
        return realFetch(input, init);
      },
    );
    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(`${baseUrl}/stats/script.js`);

    expect(response.status).toBe(200);
  });

  it("does not add CORS headers to stats proxy responses", async () => {
    const realFetch = global.fetch;
    const mockFetch = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "https://umami.dakheera47.com/script.js") {
          return new Response("ok", {
            status: 200,
            headers: { "content-type": "application/javascript" },
          });
        }
        return realFetch(input, init);
      },
    );
    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(`${baseUrl}/stats/script.js`, {
      headers: {
        origin: "https://evil.example",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

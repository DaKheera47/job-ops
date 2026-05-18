import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

const nativeFetch = globalThis.fetch;

describe.sequential("Workday API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServer({ server, closeDb, tempDir });
  });

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  it("fetches a Workday logo through the backend and returns a data URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": "4",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await nativeFetch(`${baseUrl}/api/workday/fetch-logo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "logo-request-1",
      },
      body: JSON.stringify({
        careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      data: {
        careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
        logoUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext/assets/logo",
        mimeType: "image/png",
        imageDataUrl: "data:image/png;base64,iVBORw==",
      },
      meta: {
        requestId: "logo-request-1",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://autodesk.wd1.myworkdayjobs.com/Ext/assets/logo",
      expect.objectContaining({
        method: "GET",
        redirect: "follow",
      }),
    );
  });

  it("accepts SVG logos even when the upstream mislabels them as text/plain", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(svg, {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=UTF-8",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await nativeFetch(`${baseUrl}/api/workday/fetch-logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careersUrl: "https://visa.wd5.myworkdayjobs.com/Visa",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      data: {
        careersUrl: "https://visa.wd5.myworkdayjobs.com/Visa",
        logoUrl: "https://visa.wd5.myworkdayjobs.com/Visa/assets/logo",
        mimeType: "image/svg+xml",
      },
    });
    expect(body.data.imageDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("rejects invalid Workday URLs for logo fetches", async () => {
    const res = await nativeFetch(`${baseUrl}/api/workday/fetch-logo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careersUrl: "https://example.com/careers",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_REQUEST",
      },
    });
  });
});

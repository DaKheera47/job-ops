import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Tracer links routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function seedTracerFixtures() {
    const { db, schema } = await import("../../db");
    const now = new Date().toISOString();

    const jobId = "job-tracer-fixture";
    const tracerLinkId = "link-tracer-fixture";
    const token = "tok-tracer-fixture";

    await db.insert(schema.jobs).values({
      id: jobId,
      source: "manual",
      title: "Staff Engineer",
      employer: "Example Corp",
      jobUrl: "https://example.com/jobs/staff-engineer",
      tracerLinksEnabled: true,
      createdAt: now,
      updatedAt: now,
      discoveredAt: now,
    });

    await db.insert(schema.tracerLinks).values({
      id: tracerLinkId,
      token,
      jobId,
      sourcePath: "basics.url.href",
      sourceLabel: "Portfolio",
      destinationUrl: "https://github.com/example",
      destinationUrlHash: "hash-github",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { db, schema, jobId, tracerLinkId, token };
  }

  it("redirects a valid token and records click event", async () => {
    const { db, schema, tracerLinkId, token } = await seedTracerFixtures();

    const res = await fetch(`${baseUrl}/cv/${token}`, {
      redirect: "manual",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
        referer: "https://mail.example.com/inbox",
      },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://github.com/example");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(res.headers.get("expires")).toBe("0");

    const clickRows = await db
      .select()
      .from(schema.tracerClickEvents)
      .where(eq(schema.tracerClickEvents.tracerLinkId, tracerLinkId));

    expect(clickRows.length).toBe(1);
    expect(clickRows[0]?.ipHash).toBeTruthy();
    expect(clickRows[0]?.uniqueFingerprintHash).toBeTruthy();
    expect(clickRows[0]?.referrerHost).toBe("mail.example.com");
  });

  it("returns 404 for unknown tracer token", async () => {
    const res = await fetch(`${baseUrl}/cv/does-not-exist`, {
      redirect: "manual",
    });
    expect(res.status).toBe(404);
  });

  it("returns analytics contract and supports filters", async () => {
    const { db, schema, jobId, tracerLinkId } = await seedTracerFixtures();
    const now = Math.floor(Date.now() / 1000);

    await db.insert(schema.tracerClickEvents).values([
      {
        id: randomUUID(),
        tracerLinkId,
        clickedAt: now - 60,
        requestId: "req-human-1",
        isLikelyBot: false,
        deviceType: "desktop",
        uaFamily: "chrome",
        osFamily: "macos",
        uniqueFingerprintHash: "fp-a",
      },
      {
        id: randomUUID(),
        tracerLinkId,
        clickedAt: now - 30,
        requestId: "req-bot-1",
        isLikelyBot: true,
        deviceType: "desktop",
        uaFamily: "bot",
        osFamily: "unknown",
        uniqueFingerprintHash: "fp-b",
      },
    ]);

    const analyticsRes = await fetch(
      `${baseUrl}/api/tracer-links/analytics?jobId=${jobId}&includeBots=0&from=${now - 3600}&to=${now}`,
    );

    expect(analyticsRes.status).toBe(200);
    const analyticsBody = (await analyticsRes.json()) as {
      ok: boolean;
      data?: {
        totals: { clicks: number; uniqueOpens: number; botClicks: number };
      };
      meta?: { requestId?: string };
    };

    expect(analyticsBody.ok).toBe(true);
    expect(analyticsBody.meta?.requestId).toBeTruthy();
    expect(analyticsBody.data?.totals.clicks).toBe(1);
    expect(analyticsBody.data?.totals.uniqueOpens).toBe(1);
    expect(analyticsBody.data?.totals.botClicks).toBe(0);

    const jobRes = await fetch(
      `${baseUrl}/api/tracer-links/jobs/${jobId}?includeBots=1`,
    );
    expect(jobRes.status).toBe(200);
    const jobBody = (await jobRes.json()) as {
      ok: boolean;
      data?: {
        job: { id: string };
        links: Array<{
          tracerLinkId: string;
          clicks: number;
          botClicks: number;
        }>;
      };
      meta?: { requestId?: string };
    };

    expect(jobBody.ok).toBe(true);
    expect(jobBody.meta?.requestId).toBeTruthy();
    expect(jobBody.data?.job.id).toBe(jobId);

    const row = jobBody.data?.links.find(
      (item) => item.tracerLinkId === tracerLinkId,
    );
    expect(row).toBeTruthy();
    expect(row?.clicks).toBe(2);
    expect(row?.botClicks).toBe(1);

    const persistedEvents = await db
      .select()
      .from(schema.tracerClickEvents)
      .where(
        and(
          eq(schema.tracerClickEvents.tracerLinkId, tracerLinkId),
          eq(schema.tracerClickEvents.isLikelyBot, true),
        ),
      );
    expect(persistedEvents.length).toBe(1);
  });

  it("returns tracer readiness contract", async () => {
    const realFetch = global.fetch;
    const healthUrl = "https://my-jobops.example.com/health";
    const mockFetch = vi.fn(async (input: any, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === healthUrl) {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return realFetch(input, init);
    });

    const previousBaseUrl = process.env.JOBOPS_PUBLIC_BASE_URL;
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://my-jobops.example.com";
    vi.stubGlobal("fetch", mockFetch);

    try {
      const res = await fetch(`${baseUrl}/api/tracer-links/readiness?force=1`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          status: string;
          canEnable: boolean;
          publicBaseUrl: string | null;
        };
        meta?: { requestId?: string };
      };

      expect(body.ok).toBe(true);
      expect(body.meta?.requestId).toBeTruthy();
      expect(body.data?.status).toBe("ready");
      expect(body.data?.canEnable).toBe(true);
      expect(body.data?.publicBaseUrl).toBe("https://my-jobops.example.com");
    } finally {
      vi.unstubAllGlobals();
      if (previousBaseUrl === undefined) {
        delete process.env.JOBOPS_PUBLIC_BASE_URL;
      } else {
        process.env.JOBOPS_PUBLIC_BASE_URL = previousBaseUrl;
      }
    }
  });

  it("requires auth for tracer analytics GET routes when basic auth is enabled", async () => {
    await stopServer({ server, closeDb, tempDir });
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        BASIC_AUTH_USER: "admin",
        BASIC_AUTH_PASSWORD: "secret",
      },
    }));

    const unauthorized = await fetch(`${baseUrl}/api/tracer-links/analytics`);
    expect(unauthorized.status).toBe(401);

    const credentials = Buffer.from("admin:secret").toString("base64");
    const authorized = await fetch(`${baseUrl}/api/tracer-links/analytics`, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });
    expect(authorized.status).toBe(200);
  });
});

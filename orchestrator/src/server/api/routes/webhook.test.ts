import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Webhook API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: { WEBHOOK_SECRET: "secret" },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("rejects invalid webhook credentials and accepts valid ones", async () => {
    const badRes = await fetch(`${baseUrl}/api/webhook/trigger`, {
      method: "POST",
      headers: { "x-request-id": "req-webhook-bad" },
    });
    const badBody = await badRes.json();
    expect(badRes.status).toBe(401);
    expect(badRes.headers.get("x-request-id")).toBe("req-webhook-bad");
    expect(badBody.ok).toBe(false);
    expect(badBody.error.code).toBe("UNAUTHORIZED");
    expect(badBody.meta.requestId).toBe("req-webhook-bad");

    const goodRes = await fetch(`${baseUrl}/api/webhook/trigger`, {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "x-request-id": "req-webhook-good",
      },
    });
    const goodBody = await goodRes.json();
    expect(goodBody.ok).toBe(true);
    expect(goodBody.data.message).toBe("Pipeline triggered");
    expect(goodRes.headers.get("x-request-id")).toBe("req-webhook-good");
    expect(goodBody.meta.requestId).toBe("req-webhook-good");
  });

  it("enforces webhook auth in demo mode when a secret is configured", async () => {
    const demoServer = await startServer({
      env: {
        DEMO_MODE: "true",
        WEBHOOK_SECRET: "secret",
      },
    });

    try {
      const unauthorizedRes = await fetch(
        `${demoServer.baseUrl}/api/webhook/trigger`,
        {
          method: "POST",
        },
      );
      expect(unauthorizedRes.status).toBe(401);

      const authorizedRes = await fetch(
        `${demoServer.baseUrl}/api/webhook/trigger`,
        {
          method: "POST",
          headers: { Authorization: "Bearer secret" },
        },
      );
      expect(authorizedRes.status).toBe(200);
      const authorizedBody = await authorizedRes.json();
      expect(authorizedBody.ok).toBe(true);
      expect(authorizedBody.meta.simulated).toBe(true);
    } finally {
      await stopServer(demoServer);
    }
  });

  it("rejects secret-only pipeline triggers in hosted mode", async () => {
    const hostedServer = await startServer({
      env: {
        JOBOPS_APP_MODE: "hosted",
        JOBOPS_HOSTED_TENANT_ID: "tenant_default",
        WEBHOOK_SECRET: "secret",
      },
    });

    try {
      const res = await fetch(`${hostedServer.baseUrl}/api/webhook/trigger`, {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      });
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("unavailable in hosted mode");
    } finally {
      await stopServer(hostedServer);
    }
  });
});

import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Billing routes", () => {
  let server: Server;
  let closeDb: () => void;
  let tempDir: string;

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("does not expose billing routes in local mode", async () => {
    const started = await startServer({
      env: { JOBOPS_TEST_AUTH_BYPASS: "1" },
    });
    ({ server, closeDb, tempDir } = started);

    const response = await fetch(`${started.baseUrl}/api/billing/status`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("rejects an invalid Stripe signature using the raw request body", async () => {
    const started = await startServer({
      env: {
        JOBOPS_TEST_AUTH_BYPASS: "0",
        JOBOPS_APP_MODE: "hosted",
        JOBOPS_HOSTED_TENANT_ID: "tenant_default",
        STRIPE_SECRET_KEY: "sk_test_jobops",
        STRIPE_WEBHOOK_SECRET: "whsec_jobops",
        STRIPE_PRO_PRICE_ID: "price_pro",
      },
    });
    ({ server, closeDb, tempDir } = started);

    const response = await fetch(`${started.baseUrl}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "invalid",
        "x-request-id": "req-invalid-stripe",
      },
      body: "{}",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe("req-invalid-stripe");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid Stripe webhook signature.",
      },
      meta: { requestId: "req-invalid-stripe" },
    });
  });
});

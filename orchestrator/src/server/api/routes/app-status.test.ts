import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("App status routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  describe("GET /api/app/status", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          JOBOPS_TEST_AUTH_BYPASS: "0",
        },
      }));
    });

    it("is public and returns local/default capabilities", async () => {
      const res = await fetch(`${baseUrl}/api/app/status`, {
        headers: { "x-request-id": "req-app-status-local" },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("x-request-id")).toBe("req-app-status-local");
      const body = await res.json();
      expect(body).toEqual({
        ok: true,
        data: {
          appMode: "local",
          capabilities: {
            hostedSignups: false,
            platformLlm: false,
            quotas: false,
            userEditableLlmSettings: true,
          },
          hostedTenantConfigured: false,
        },
        meta: {
          requestId: "req-app-status-local",
        },
      });
    });
  });

  describe("GET /api/app/status in hosted mode", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          JOBOPS_TEST_AUTH_BYPASS: "0",
          JOBOPS_APP_MODE: "hosted",
          JOBOPS_HOSTED_SIGNUPS_ENABLED: "true",
          JOBOPS_HOSTED_PLATFORM_LLM_ENABLED: "1",
          JOBOPS_HOSTED_QUOTAS_ENABLED: "yes",
          JOBOPS_HOSTED_TENANT_ID: "tenant_hosted",
        },
      }));
    });

    it("reflects hosted capabilities without exposing tenant id", async () => {
      const res = await fetch(`${baseUrl}/api/app/status`, {
        headers: { "x-request-id": "req-app-status-hosted" },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        ok: true,
        data: {
          appMode: "hosted",
          capabilities: {
            hostedSignups: true,
            platformLlm: true,
            quotas: true,
            userEditableLlmSettings: false,
          },
          hostedTenantConfigured: true,
        },
        meta: {
          requestId: "req-app-status-hosted",
        },
      });
      expect(JSON.stringify(body)).not.toContain("tenant_hosted");
    });
  });
});

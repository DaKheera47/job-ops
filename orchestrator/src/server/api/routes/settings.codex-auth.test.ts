import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  startCodexDeviceAuthMock,
  disconnectCodexAuthMock,
  getCodexDeviceAuthSnapshotMock,
  validateCredentialsMock,
} = vi.hoisted(() => ({
  startCodexDeviceAuthMock: vi.fn(),
  disconnectCodexAuthMock: vi.fn(),
  getCodexDeviceAuthSnapshotMock: vi.fn(),
  validateCredentialsMock: vi.fn(),
}));

vi.mock("@server/services/llm/codex/login", () => ({
  startCodexDeviceAuth: startCodexDeviceAuthMock,
  disconnectCodexAuth: disconnectCodexAuthMock,
  getCodexDeviceAuthSnapshot: getCodexDeviceAuthSnapshotMock,
}));

vi.mock("@server/services/llm/service", () => ({
  LlmService: vi.fn(function MockLlmService() {
    return {
      validateCredentials: validateCredentialsMock,
      listModels: vi.fn().mockResolvedValue([]),
    };
  }),
}));

import { startServer, stopServer } from "./test-utils";

describe.sequential("Settings codex auth routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    getCodexDeviceAuthSnapshotMock.mockReturnValue({
      status: "idle",
      loginInProgress: false,
      verificationUrl: null,
      userCode: null,
      startedAt: null,
      expiresAt: null,
      message: null,
    });
    validateCredentialsMock.mockResolvedValue({
      valid: false,
      message: "Codex not authenticated",
    });
    startCodexDeviceAuthMock.mockResolvedValue(undefined);
    disconnectCodexAuthMock.mockResolvedValue(undefined);

    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        LLM_API_KEY: "secret-key",
      },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("returns codex auth status in the standard API wrapper", async () => {
    const res = await fetch(`${baseUrl}/api/settings/codex-auth`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.authenticated).toBe(false);
    expect(body.data.flowStatus).toBe("idle");
    expect(body.data.validationMessage).toBe("Codex not authenticated");
  });

  it("caches codex validation briefly while device auth is in progress", async () => {
    getCodexDeviceAuthSnapshotMock.mockReturnValue({
      status: "running",
      loginInProgress: true,
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
      startedAt: "2026-04-14T16:00:00.000Z",
      expiresAt: "2026-04-14T16:15:00.000Z",
      message: "Open the verification URL and enter the one-time code.",
    });

    const first = await fetch(`${baseUrl}/api/settings/codex-auth`);
    const second = await fetch(`${baseUrl}/api/settings/codex-auth`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(validateCredentialsMock).toHaveBeenCalledTimes(1);
  });

  it("starts codex device auth and returns flow details", async () => {
    startCodexDeviceAuthMock.mockResolvedValueOnce({
      status: "running",
      loginInProgress: true,
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
      startedAt: "2026-04-14T16:00:00.000Z",
      expiresAt: "2026-04-14T16:15:00.000Z",
      message: "Open the verification URL and enter the one-time code.",
    });
    getCodexDeviceAuthSnapshotMock.mockReturnValueOnce({
      status: "running",
      loginInProgress: true,
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
      startedAt: "2026-04-14T16:00:00.000Z",
      expiresAt: "2026-04-14T16:15:00.000Z",
      message: "Open the verification URL and enter the one-time code.",
    });

    const res = await fetch(`${baseUrl}/api/settings/codex-auth/start`, {
      method: "POST",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.flowStatus).toBe("running");
    expect(body.data.userCode).toBe("ABCD-EFGH");
    expect(startCodexDeviceAuthMock).toHaveBeenCalledWith(false);
  });

  it("forces codex device auth restart when requested", async () => {
    const res = await fetch(`${baseUrl}/api/settings/codex-auth/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceRestart: true }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(startCodexDeviceAuthMock).toHaveBeenCalledWith(true);
  });

  it("returns SERVICE_UNAVAILABLE when codex auth start fails", async () => {
    startCodexDeviceAuthMock.mockRejectedValueOnce(
      new Error("Codex CLI is not installed in this runtime."),
    );

    const res = await fetch(`${baseUrl}/api/settings/codex-auth/start`, {
      method: "POST",
      headers: { "x-request-id": "req-codex-auth-fail" },
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.meta.requestId).toBe("req-codex-auth-fail");
  });

  it("disconnects codex auth and returns status", async () => {
    const res = await fetch(`${baseUrl}/api/settings/codex-auth/disconnect`, {
      method: "POST",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.authenticated).toBe(false);
    expect(disconnectCodexAuthMock).toHaveBeenCalledOnce();
  });
});

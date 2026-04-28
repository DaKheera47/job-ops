import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthGuard } from "./app";

vi.mock("@server/auth/jwt", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("@server/repositories/users", () => ({
  countUsers: vi.fn(),
  getUserById: vi.fn(),
}));

import { verifyToken } from "@server/auth/jwt";
import { countUsers, getUserById } from "@server/repositories/users";

const originalEnv = { ...process.env };

function buildBearerHeader(token = "valid-token"): string {
  return `Bearer ${token}`;
}

function createMockRequest(input: {
  method: string;
  path: string;
  authorization?: string;
}): Request {
  return {
    method: input.method,
    path: input.path,
    headers: input.authorization ? { authorization: input.authorization } : {},
  } as Request;
}

function createMockResponse(): Response & {
  statusCode: number;
  jsonBody: unknown;
} {
  return {
    statusCode: 200,
    jsonBody: null,
    getHeader: vi.fn(() => undefined),
    setHeader: vi.fn(),
    status: vi.fn(function status(
      this: Response & { statusCode: number },
      code: number,
    ) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function json(
      this: Response & { jsonBody: unknown },
      body: unknown,
    ) {
      this.jsonBody = body;
      return this;
    }),
  } as unknown as Response & { statusCode: number; jsonBody: unknown };
}

describe.sequential("Auth read-only enforcement", () => {
  beforeEach(() => {
    process.env.JOBOPS_TEST_AUTH_BYPASS = "0";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.env.JOBOPS_TEST_AUTH_BYPASS = "0";
    vi.clearAllMocks();
  });

  it("allows non-API GETs without auth when authentication is enabled", async () => {
    vi.mocked(countUsers).mockResolvedValue(1);

    const { middleware } = createAuthGuard();
    const req = createMockRequest({ method: "GET", path: "/health" });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks GET /api/* without auth when authentication is enabled", async () => {
    vi.mocked(countUsers).mockResolvedValue(1);

    const { middleware } = createAuthGuard();
    const req = createMockRequest({ method: "GET", path: "/api/jobs" });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("allows OPTIONS preflight without auth even for API routes", async () => {
    vi.mocked(countUsers).mockResolvedValue(1);

    const { middleware } = createAuthGuard();
    const req = createMockRequest({ method: "OPTIONS", path: "/api/jobs" });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows webhook trigger without JWT auth guard", async () => {
    process.env.WEBHOOK_SECRET = "configured-webhook-secret";
    const { middleware } = createAuthGuard();
    const req = createMockRequest({
      method: "POST",
      path: "/api/webhook/trigger",
    });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).toHaveBeenCalledOnce();
    expect(countUsers).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("requires JWT auth for webhook trigger when no webhook secret is configured", async () => {
    delete process.env.WEBHOOK_SECRET;
    vi.mocked(countUsers).mockResolvedValue(1);

    const { middleware } = createAuthGuard();
    const req = createMockRequest({
      method: "POST",
      path: "/api/webhook/trigger",
    });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("allows Umami stats beacons without JWT auth", async () => {
    const { middleware } = createAuthGuard();
    const req = createMockRequest({
      method: "POST",
      path: "/stats/api/send",
    });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).toHaveBeenCalledOnce();
    expect(countUsers).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks POST/PATCH/DELETE without auth when authentication is enabled", async () => {
    vi.mocked(countUsers).mockResolvedValue(1);

    const { middleware } = createAuthGuard();

    for (const request of [
      createMockRequest({ method: "POST", path: "/api/jobs/actions" }),
      createMockRequest({ method: "PATCH", path: "/api/jobs/123" }),
      createMockRequest({ method: "DELETE", path: "/api/jobs/status/skipped" }),
    ]) {
      const res = createMockResponse();
      const next = vi.fn() as NextFunction;

      middleware(request, res, next);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toMatchObject({
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }
  });

  it("allows API GETs with a valid bearer token when enabled", async () => {
    vi.mocked(countUsers).mockResolvedValue(1);
    vi.mocked(verifyToken).mockResolvedValue({
      sub: "user",
      jti: "session-1",
      exp: Math.floor(Date.now() / 1000) + 60,
      userId: "user-1",
      tenantId: "tenant-1",
      username: "user",
      isSystemAdmin: false,
    });
    vi.mocked(getUserById).mockResolvedValue({
      id: "user-1",
      username: "user",
      displayName: null,
      isSystemAdmin: false,
      isDisabled: false,
      workspaceId: "tenant-1",
      workspaceName: "Tenant 1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { middleware } = createAuthGuard();
    const req = createMockRequest({
      method: "GET",
      path: "/api/jobs",
      authorization: buildBearerHeader(),
    });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a valid token after the user is disabled", async () => {
    vi.mocked(countUsers).mockResolvedValue(1);
    vi.mocked(verifyToken).mockResolvedValue({
      sub: "user",
      jti: "session-1",
      exp: Math.floor(Date.now() / 1000) + 60,
      userId: "user-1",
      tenantId: "tenant-1",
      username: "user",
      isSystemAdmin: true,
    });
    vi.mocked(getUserById).mockResolvedValue({
      id: "user-1",
      username: "user",
      displayName: null,
      isSystemAdmin: true,
      isDisabled: true,
      workspaceId: "tenant-1",
      workspaceName: "Tenant 1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { middleware } = createAuthGuard();
    const req = createMockRequest({
      method: "GET",
      path: "/api/jobs",
      authorization: buildBearerHeader(),
    });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("requires initial setup before private APIs are usable", async () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;
    vi.mocked(countUsers).mockResolvedValue(0);

    const { middleware } = createAuthGuard();
    const req = createMockRequest({
      method: "POST",
      path: "/api/jobs/actions",
    });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Initial setup is required",
      },
    });
  });
});

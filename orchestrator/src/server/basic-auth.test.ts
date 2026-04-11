import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthGuard } from "./app";

vi.mock("@server/auth/jwt", () => ({
  verifyToken: vi.fn(),
}));

import { verifyToken } from "@server/auth/jwt";

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
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("allows non-API GETs without auth when authentication is enabled", () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    const { middleware } = createAuthGuard();
    const req = createMockRequest({ method: "GET", path: "/health" });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks GET /api/* without auth when authentication is enabled", async () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    const { middleware } = createAuthGuard();
    const req = createMockRequest({ method: "GET", path: "/api/jobs" });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);
    await Promise.resolve();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("allows OPTIONS preflight without auth even for API routes", () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    const { middleware } = createAuthGuard();
    const req = createMockRequest({ method: "OPTIONS", path: "/api/jobs" });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks POST/PATCH/DELETE without auth when authentication is enabled", async () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    const { middleware } = createAuthGuard();

    for (const request of [
      createMockRequest({ method: "POST", path: "/api/jobs/actions" }),
      createMockRequest({ method: "PATCH", path: "/api/jobs/123" }),
      createMockRequest({ method: "DELETE", path: "/api/jobs/status/skipped" }),
    ]) {
      const res = createMockResponse();
      const next = vi.fn() as NextFunction;

      middleware(request, res, next);
      await Promise.resolve();

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
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";
    vi.mocked(verifyToken).mockResolvedValue({
      sub: "user",
      jti: "session-1",
      exp: Math.floor(Date.now() / 1000) + 60,
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

  it("does not require auth when Basic Auth is disabled", () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;

    const { middleware } = createAuthGuard();
    const req = createMockRequest({
      method: "POST",
      path: "/api/jobs/actions",
    });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

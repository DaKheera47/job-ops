import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBasicAuthGuard } from "./app";

const originalEnv = { ...process.env };

function buildAuthHeader(user: string, pass: string): string {
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
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

describe.sequential("Basic Auth read-only enforcement", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("allows read-only GETs without auth when Basic Auth is enabled", () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    const { middleware } = createBasicAuthGuard();
    const req = createMockRequest({ method: "GET", path: "/health" });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks POST/PATCH/DELETE without auth when Basic Auth is enabled", () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    const { middleware } = createBasicAuthGuard();

    for (const request of [
      createMockRequest({ method: "POST", path: "/api/jobs/actions" }),
      createMockRequest({ method: "PATCH", path: "/api/jobs/123" }),
      createMockRequest({ method: "DELETE", path: "/api/jobs/status/skipped" }),
    ]) {
      const res = createMockResponse();
      const next = vi.fn() as NextFunction;

      middleware(request, res, next);

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

  it("allows writes with valid Basic Auth when enabled", () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    const { middleware } = createBasicAuthGuard();
    const req = createMockRequest({
      method: "POST",
      path: "/api/jobs/actions",
      authorization: buildAuthHeader("user", "pass"),
    });
    const res = createMockResponse();
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("does not require auth when Basic Auth is disabled", () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;

    const { middleware } = createBasicAuthGuard();
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

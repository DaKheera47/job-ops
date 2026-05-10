import { badRequest, serviceUnavailable, tooManyRequests, unauthorized } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { blacklistToken, signToken, verifyToken } from "@server/auth/jwt";
import { verifyPassword } from "@server/auth/password";
import * as usersRepo from "@server/repositories/users";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const setupSchema = loginSchema.extend({
  password: z.string().min(8).max(500),
  displayName: z.string().trim().min(1).max(120).optional(),
});

// Per-IP brute-force protection for login. In-memory; resets on restart.
// 8 failed attempts per 15 minutes is generous for typos but blocks
// password-spraying.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;

interface LoginAttempt {
  failures: number;
  resetAt: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

function loginRateKey(req: Request): string {
  return req.ip ?? "unknown";
}

function checkLoginRateLimit(req: Request): {
  allowed: boolean;
  retryInSeconds?: number;
} {
  const key = loginRateKey(req);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) return { allowed: true };
  if (entry.failures >= LOGIN_MAX_FAILURES) {
    return {
      allowed: false,
      retryInSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  return { allowed: true };
}

function recordLoginFailure(req: Request): void {
  const key = loginRateKey(req);
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { failures: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.failures += 1;
}

function clearLoginFailures(req: Request): void {
  loginAttempts.delete(loginRateKey(req));
}

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncRoute(async (req: Request, res: Response) => {
    const gate = checkLoginRateLimit(req);
    if (!gate.allowed) {
      res.setHeader("Retry-After", String(gate.retryInSeconds ?? 60));
      fail(
        res,
        tooManyRequests("Too many failed attempts. Try again later."),
      );
      return;
    }

    if ((await usersRepo.countUsers()) === 0) {
      fail(res, badRequest("Initial setup is required before sign-in"));
      return;
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const { username, password } = parsed.data;
    const user = await usersRepo.getUserForLogin(username);
    if (!user || user.isDisabled) {
      recordLoginFailure(req);
      fail(res, unauthorized("Invalid credentials"));
      return;
    }

    const passwordValid = await verifyPassword({
      password,
      passwordHash: user.passwordHash,
      passwordSalt: user.passwordSalt,
    });
    if (!passwordValid) {
      recordLoginFailure(req);
      fail(res, unauthorized("Invalid credentials"));
      return;
    }

    let token: string;
    let expiresIn: number;
    try {
      ({ token, expiresIn } = await signToken({
        sub: user.id,
        userId: user.id,
        tenantId: user.tenantId,
        username: user.username,
        isSystemAdmin: user.isSystemAdmin,
      }));
    } catch (error) {
      fail(
        res,
        serviceUnavailable(
          error instanceof Error
            ? error.message
            : "Authentication is not fully configured",
        ),
      );
      return;
    }

    clearLoginFailures(req);
    ok(res, { token, expiresIn });
  }),
);

authRouter.get(
  "/bootstrap-status",
  asyncRoute(async (_req: Request, res: Response) => {
    ok(res, { setupRequired: (await usersRepo.countUsers()) === 0 });
  }),
);

authRouter.post(
  "/setup",
  asyncRoute(async (req: Request, res: Response) => {
    if ((await usersRepo.countUsers()) > 0) {
      fail(res, badRequest("Initial setup has already been completed"));
      return;
    }

    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const user = await usersRepo.createInitialSystemAdmin({
      username: parsed.data.username,
      password: parsed.data.password,
      displayName: parsed.data.displayName ?? parsed.data.username,
    });
    if (!user) {
      fail(res, badRequest("Initial setup has already been completed"));
      return;
    }

    const { token, expiresIn } = await signToken({
      sub: user.id,
      userId: user.id,
      tenantId: user.workspaceId,
      username: user.username,
      isSystemAdmin: user.isSystemAdmin,
    });

    ok(res, { token, expiresIn, user }, 201);
  }),
);

authRouter.get(
  "/me",
  asyncRoute(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      fail(res, unauthorized("Authentication required"));
      return;
    }
    const token = authHeader.slice("Bearer ".length).trim();
    const payload = await verifyToken(token);
    const user = await usersRepo.getUserById(payload.userId);
    if (!user || user.isDisabled) {
      fail(res, unauthorized("Authentication required"));
      return;
    }
    ok(res, { user });
  }),
);

authRouter.post(
  "/logout",
  asyncRoute(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      try {
        const { jti } = await verifyToken(token);
        await blacklistToken(jti);
      } catch {
        // Token already invalid — logout is idempotent.
      }
    }
    ok(res, { message: "Logged out" });
  }),
);

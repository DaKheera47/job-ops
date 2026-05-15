import { badRequest, serviceUnavailable, unauthorized } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { blacklistToken, signToken, verifyToken } from "@server/auth/jwt";
import { verifyPassword } from "@server/auth/password";
import { isDemoMode } from "@server/config/demo";
import { getOrCreateAnalyticsInstallState } from "@server/repositories/product-analytics";
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

function toSetupValidationMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.join(".");

  if (path === "password") {
    if (issue?.code === "too_small") {
      return `Password must be at least ${issue.minimum} characters.`;
    }
    if (issue?.code === "too_big") {
      return `Password must be ${issue.maximum} characters or fewer.`;
    }
    return "Enter a valid password.";
  }

  if (path === "username") {
    return "Enter a username.";
  }

  if (path === "displayName") {
    return "Enter a name or leave the field blank.";
  }

  return "Invalid request body";
}

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncRoute(async (req: Request, res: Response) => {
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
      fail(res, unauthorized("Invalid credentials"));
      return;
    }

    const passwordValid = await verifyPassword({
      password,
      passwordHash: user.passwordHash,
      passwordSalt: user.passwordSalt,
    });
    if (!passwordValid) {
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

    ok(res, { token, expiresIn });
  }),
);

authRouter.get(
  "/bootstrap-status",
  asyncRoute(async (_req: Request, res: Response) => {
    if (isDemoMode()) {
      ok(res, { setupRequired: false });
      return;
    }

    ok(res, { setupRequired: (await usersRepo.countUsers()) === 0 });
  }),
);

authRouter.post(
  "/setup",
  asyncRoute(async (req: Request, res: Response) => {
    if (isDemoMode()) {
      fail(
        res,
        serviceUnavailable("First-run setup is disabled in the public demo."),
      );
      return;
    }

    if ((await usersRepo.countUsers()) > 0) {
      fail(res, badRequest("Initial setup has already been completed"));
      return;
    }

    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(
        res,
        badRequest(
          toSetupValidationMessage(parsed.error),
          parsed.error.flatten(),
        ),
      );
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
    const installState = await getOrCreateAnalyticsInstallState();
    ok(res, {
      user,
      analyticsDistinctId: installState.distinctId,
    });
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

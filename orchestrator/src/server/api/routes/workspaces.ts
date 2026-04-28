import { badRequest, conflict, forbidden, notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { getUserId, isSystemAdmin } from "@infra/request-context";
import * as authSessionsRepo from "@server/repositories/auth-sessions";
import * as usersRepo from "@server/repositories/users";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const workspacesRouter = Router();

const createUserSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(500),
  displayName: z.string().trim().min(1).max(120).optional(),
  isSystemAdmin: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(500),
});

const disableUserSchema = z.object({
  isDisabled: z.boolean(),
});

const changeOwnPasswordSchema = z.object({
  password: z.string().min(8).max(500),
});

function requireSystemAdmin(res: Response): boolean {
  if (isSystemAdmin()) return true;
  fail(res, forbidden("System admin access is required"));
  return false;
}

function isUsernameConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /UNIQUE constraint failed: users\.username/i.test(error.message);
}

workspacesRouter.get(
  "/users",
  asyncRoute(async (_req: Request, res: Response) => {
    if (!requireSystemAdmin(res)) return;
    ok(res, { users: await usersRepo.listUsers() });
  }),
);

workspacesRouter.post(
  "/users",
  asyncRoute(async (req: Request, res: Response) => {
    if (!requireSystemAdmin(res)) return;
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    try {
      const user = await usersRepo.createPrivateWorkspaceUser({
        username: parsed.data.username,
        password: parsed.data.password,
        displayName: parsed.data.displayName ?? parsed.data.username,
        isSystemAdmin: parsed.data.isSystemAdmin ?? false,
      });
      ok(res, { user }, 201);
      return;
    } catch (error) {
      if (isUsernameConflictError(error)) {
        fail(res, conflict("Username already exists"));
        return;
      }
      throw error;
    }
  }),
);

workspacesRouter.patch(
  "/users/:id/disabled",
  asyncRoute(async (req: Request, res: Response) => {
    if (!requireSystemAdmin(res)) return;
    const parsed = disableUserSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const userId = req.params.id;
    if (!userId) {
      fail(res, badRequest("User id is required"));
      return;
    }
    if (userId === getUserId() && parsed.data.isDisabled) {
      fail(res, badRequest("You cannot disable your own user"));
      return;
    }

    const user = await usersRepo.setUserDisabled(
      userId,
      parsed.data.isDisabled,
    );
    if (!user) {
      fail(res, notFound("User not found"));
      return;
    }
    ok(res, { user });
  }),
);

workspacesRouter.post(
  "/users/:id/reset-password",
  asyncRoute(async (req: Request, res: Response) => {
    if (!requireSystemAdmin(res)) return;
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const userId = req.params.id;
    if (!userId) {
      fail(res, badRequest("User id is required"));
      return;
    }
    const user = await usersRepo.getUserById(userId);
    if (!user) {
      fail(res, notFound("User not found"));
      return;
    }

    await usersRepo.updateUserPassword({
      id: userId,
      password: parsed.data.password,
    });
    await authSessionsRepo.revokeAuthSessionsForUser(userId);
    ok(res, { userId });
  }),
);

workspacesRouter.post(
  "/me/password",
  asyncRoute(async (req: Request, res: Response) => {
    const userId = getUserId();
    if (!userId) {
      fail(res, forbidden("Authenticated user context is required"));
      return;
    }
    const parsed = changeOwnPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    await usersRepo.updateUserPassword({
      id: userId,
      password: parsed.data.password,
    });
    ok(res, { userId });
  }),
);

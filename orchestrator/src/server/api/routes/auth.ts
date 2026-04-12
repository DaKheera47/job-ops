import { badRequest, serviceUnavailable, unauthorized } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { blacklistToken, signToken, verifyToken } from "@server/auth/jwt";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncRoute(async (req: Request, res: Response) => {
    const authUser = process.env.BASIC_AUTH_USER || "";
    const authPass = process.env.BASIC_AUTH_PASSWORD || "";

    if (!authUser || !authPass) {
      fail(res, badRequest("Authentication is not enabled"));
      return;
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const { username, password } = parsed.data;
    if (username !== authUser || password !== authPass) {
      fail(res, unauthorized("Invalid credentials"));
      return;
    }

    let token: string;
    let expiresIn: number;
    try {
      ({ token, expiresIn } = await signToken(username));
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

import type { NextFunction, Request, Response } from "express";
import { unauthorized, forbidden } from "@infra/errors";
import { fail } from "@infra/http";
import { verifyAccessToken, verifyReauthToken } from "@server/lib/tokens";

declare global {
  namespace Express {
    interface Request {
      auth?: { adminId: string };
    }
  }
}

function getJwtSecret(): { current: string; previous?: string } {
  const current = process.env.JWT_SECRET;
  if (!current) throw new Error("JWT_SECRET not set");
  return {
    current,
    previous: process.env.JWT_SECRET_PREVIOUS || undefined,
  };
}

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    fail(res, unauthorized("Missing or invalid Authorization header"));
    return;
  }

  const token = authHeader.slice(7);
  try {
    const { current, previous } = getJwtSecret();
    const payload = verifyAccessToken(token, current, previous);
    req.auth = { adminId: payload.sub };
    next();
  } catch {
    fail(res, unauthorized("Invalid or expired token"));
  }
};

export const requireReauth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    fail(res, unauthorized("Missing or invalid Authorization header"));
    return;
  }

  const accessTokenStr = authHeader.slice(7);
  const { current, previous } = getJwtSecret();

  let adminId: string;
  try {
    const payload = verifyAccessToken(accessTokenStr, current, previous);
    adminId = payload.sub;
    req.auth = { adminId };
  } catch {
    fail(res, unauthorized("Invalid or expired token"));
    return;
  }

  const reauthToken = req.headers["x-reauth-token"] as string | undefined;
  if (!reauthToken) {
    fail(res, forbidden("Re-authentication required"));
    return;
  }

  try {
    const reauthPayload = verifyReauthToken(reauthToken, current, previous);
    if (reauthPayload.sub !== adminId) {
      fail(res, forbidden("Re-auth token admin mismatch"));
      return;
    }
    next();
  } catch {
    fail(res, forbidden("Invalid or expired re-auth token"));
  }
};

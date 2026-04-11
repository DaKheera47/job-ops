import { randomUUID } from "node:crypto";
import * as authSessionsRepo from "@server/repositories/auth-sessions";
import jwt from "jsonwebtoken";

const DEFAULT_EXPIRY_SECONDS = 86400; // 24 hours

function getJwtSecret(): string {
  const explicit = process.env.JWT_SECRET;
  if (explicit && explicit.length >= 32) {
    return explicit;
  }

  throw new Error("JWT_SECRET must be set and at least 32 characters long");
}

function getJwtExpirySeconds(): number {
  const raw = process.env.JWT_EXPIRY_SECONDS;
  if (!raw) return DEFAULT_EXPIRY_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EXPIRY_SECONDS;
}

export async function signToken(sub: string): Promise<{
  token: string;
  expiresIn: number;
}> {
  const secret = getJwtSecret();
  const expiresIn = getJwtExpirySeconds();
  const jti = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  await authSessionsRepo.createAuthSession({
    id: jti,
    subject: sub,
    expiresAt,
  });

  const token = jwt.sign({ sub }, secret, {
    algorithm: "HS256",
    expiresIn,
    jwtid: jti,
  });

  return { token, expiresIn };
}

export async function verifyToken(token: string): Promise<{
  sub: string;
  jti: string;
  exp: number;
}> {
  const secret = getJwtSecret();
  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
  }) as jwt.JwtPayload;

  if (!payload.sub || !payload.jti || !payload.exp) {
    throw new Error("Token missing required claims");
  }

  const session = await authSessionsRepo.getAuthSession(payload.jti);
  const now = Math.floor(Date.now() / 1000);
  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt <= now ||
    session.subject !== payload.sub
  ) {
    throw new Error("Token has been revoked");
  }

  return {
    sub: payload.sub,
    jti: payload.jti,
    exp: payload.exp,
  };
}

export async function blacklistToken(jti: string): Promise<void> {
  await authSessionsRepo.revokeAuthSession(jti);
}

/** Test-only: clear persisted auth sessions. */
export async function __resetBlacklistForTests(): Promise<void> {
  await authSessionsRepo.deleteAllAuthSessions();
}

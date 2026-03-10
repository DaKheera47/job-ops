import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

export interface TokenPayload {
  sub: string;
  type: "access" | "refresh" | "reauth";
  jti?: string;
  iat: number;
  exp: number;
}

const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";
const REAUTH_EXPIRY = "5m";

export function issueAccessToken(adminId: string, secret: string): string {
  return jwt.sign({ sub: adminId, type: "access" }, secret, {
    expiresIn: ACCESS_EXPIRY,
  });
}

export function issueRefreshToken(
  adminId: string,
  secret: string,
): { token: string; jti: string } {
  const jti = randomUUID();
  const token = jwt.sign({ sub: adminId, type: "refresh", jti }, secret, {
    expiresIn: REFRESH_EXPIRY,
  });
  return { token, jti };
}

export function issueReauthToken(adminId: string, secret: string): string {
  return jwt.sign({ sub: adminId, type: "reauth" }, secret, {
    expiresIn: REAUTH_EXPIRY,
  });
}

function verifyWithFallback(
  token: string,
  secret: string,
  previousSecret?: string,
): TokenPayload {
  try {
    return jwt.verify(token, secret) as TokenPayload;
  } catch (err) {
    if (previousSecret) {
      return jwt.verify(token, previousSecret) as TokenPayload;
    }
    throw err;
  }
}

export function verifyAccessToken(
  token: string,
  secret: string,
  previousSecret?: string,
): TokenPayload {
  const payload = verifyWithFallback(token, secret, previousSecret);
  if (payload.type !== "access") {
    throw new Error("Invalid token type: expected access");
  }
  return payload;
}

export function verifyRefreshToken(
  token: string,
  secret: string,
  previousSecret?: string,
): TokenPayload {
  const payload = verifyWithFallback(token, secret, previousSecret);
  if (payload.type !== "refresh") {
    throw new Error("Invalid token type: expected refresh");
  }
  return payload;
}

export function verifyReauthToken(
  token: string,
  secret: string,
  previousSecret?: string,
): TokenPayload {
  const payload = verifyWithFallback(token, secret, previousSecret);
  if (payload.type !== "reauth") {
    throw new Error("Invalid token type: expected reauth");
  }
  return payload;
}

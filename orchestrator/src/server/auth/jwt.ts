import type { KeyObject } from "node:crypto";
import { createHmac, createSecretKey, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const DEFAULT_EXPIRY_SECONDS = 86400; // 24 hours

/** In-memory set of revoked token IDs (JTI). Auto-prunes on expiry. */
const blacklist = new Set<string>();

function getJwtSecret(): KeyObject {
  const explicit = process.env.JWT_SECRET;
  if (explicit && explicit.length >= 32) {
    return createSecretKey(Buffer.from(explicit, "utf-8"));
  }

  // Derive from Basic Auth credentials if available.
  const user = process.env.BASIC_AUTH_USER || "";
  const pass = process.env.BASIC_AUTH_PASSWORD || "";
  if (user && pass) {
    const derived = createHmac("sha256", "jobops-jwt-secret")
      .update(`${user}:${pass}`)
      .digest();
    return createSecretKey(derived);
  }

  throw new Error(
    "JWT_SECRET or BASIC_AUTH_USER/BASIC_AUTH_PASSWORD must be set",
  );
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

  const token = await new SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);

  return { token, expiresIn };
}

export async function verifyToken(
  token: string,
): Promise<{ sub: string; jti: string; exp: number }> {
  const secret = getJwtSecret();
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });

  if (!payload.sub || !payload.jti || !payload.exp) {
    throw new Error("Token missing required claims");
  }

  if (blacklist.has(payload.jti)) {
    throw new Error("Token has been revoked");
  }

  return {
    sub: payload.sub,
    jti: payload.jti,
    exp: payload.exp,
  };
}

export function blacklistToken(jti: string, expiresAt: number): void {
  blacklist.add(jti);
  const ttlMs = (expiresAt - Math.floor(Date.now() / 1000)) * 1000;
  if (ttlMs > 0) {
    setTimeout(() => blacklist.delete(jti), ttlMs).unref();
  } else {
    blacklist.delete(jti);
  }
}

export function isBlacklisted(jti: string): boolean {
  return blacklist.has(jti);
}

/** Test-only: clear the blacklist. */
export function __resetBlacklistForTests(): void {
  blacklist.clear();
}

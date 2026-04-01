import { createHmac, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

const DEFAULT_EXPIRY_SECONDS = 86400; // 24 hours

/** In-memory set of revoked token IDs (JTI). Auto-prunes on expiry. */
const blacklist = new Set<string>();

function getJwtSecret(): string {
  const explicit = process.env.JWT_SECRET;
  if (explicit && explicit.length >= 32) {
    return explicit;
  }

  // Derive from Basic Auth credentials if available.
  const user = process.env.BASIC_AUTH_USER || "";
  const pass = process.env.BASIC_AUTH_PASSWORD || "";
  if (user && pass) {
    return createHmac("sha256", "jobops-jwt-secret")
      .update(`${user}:${pass}`)
      .digest("hex");
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

export function signToken(sub: string): {
  token: string;
  expiresIn: number;
} {
  const secret = getJwtSecret();
  const expiresIn = getJwtExpirySeconds();
  const jti = randomUUID();

  const token = jwt.sign({ sub }, secret, {
    algorithm: "HS256",
    expiresIn,
    jwtid: jti,
  });

  return { token, expiresIn };
}

export function verifyToken(token: string): {
  sub: string;
  jti: string;
  exp: number;
} {
  const secret = getJwtSecret();
  const payload = jwt.verify(token, secret, {
    algorithms: ["HS256"],
  }) as jwt.JwtPayload;

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

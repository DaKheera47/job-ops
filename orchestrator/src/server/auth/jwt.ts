import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@infra/logger";
import { getDataDir } from "@server/config/dataDir";
import * as authSessionsRepo from "@server/repositories/auth-sessions";
import jwt from "jsonwebtoken";

const DEFAULT_EXPIRY_SECONDS = 86400; // 24 hours
const MIN_JWT_SECRET_LENGTH = 32;
const LOCAL_JWT_SECRET_FILENAME = "jwt-secret";
let cachedJwtSecret: string | null = null;

async function readPersistedJwtSecret(
  secretPath: string,
): Promise<string | null> {
  try {
    const stored = (await readFile(secretPath, "utf8")).trim();
    return stored || null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function ensurePersistedJwtSecret(): Promise<string> {
  const dataDir = getDataDir();
  const secretPath = join(dataDir, LOCAL_JWT_SECRET_FILENAME);

  await mkdir(dataDir, { recursive: true });

  const existing = await readPersistedJwtSecret(secretPath);
  if (existing) {
    if (existing.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(
        `Persisted JWT secret at ${secretPath} must be at least ${MIN_JWT_SECRET_LENGTH} characters long`,
      );
    }
    return existing;
  }

  const generated = randomBytes(48).toString("base64url");
  try {
    await writeFile(secretPath, `${generated}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    logger.info("Generated local JWT secret", {
      path: secretPath,
    });
    return generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    const raced = await readPersistedJwtSecret(secretPath);
    if (!raced || raced.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(
        `Persisted JWT secret at ${secretPath} must be at least ${MIN_JWT_SECRET_LENGTH} characters long`,
      );
    }
    return raced;
  }
}

async function getJwtSecret(): Promise<string> {
  if (cachedJwtSecret) return cachedJwtSecret;

  const explicit = process.env.JWT_SECRET;
  if (explicit) {
    if (explicit.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`,
      );
    }
    cachedJwtSecret = explicit;
    return explicit;
  }

  const persisted = await ensurePersistedJwtSecret();
  cachedJwtSecret = persisted;
  return persisted;
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
  const secret = await getJwtSecret();
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
  const secret = await getJwtSecret();
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
  cachedJwtSecret = null;
  await authSessionsRepo.deleteAllAuthSessions();
}

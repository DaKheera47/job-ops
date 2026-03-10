import { createHash, timingSafeEqual } from "node:crypto";
import { unauthorized, forbidden, badRequest } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { logAuditEvent } from "@server/lib/audit";
import { decrypt } from "@server/lib/encryption";
import {
  issueAccessToken,
  issueRefreshToken,
  issueReauthToken,
  verifyRefreshToken,
} from "@server/lib/tokens";
import { requireAuth } from "@server/middleware/auth";
import { db } from "@server/db";
import { admin, passkeys, refreshTokens, auditLog } from "@server/db/schema";
import { eq, and, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { verifySync as otpVerifySync } from "otplib";
import { Router } from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { z } from "zod";

const router = Router();

// ─── Config ───────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set");
  return secret;
}

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY not set");
  return key;
}

function getWebAuthnConfig() {
  return {
    rpID: process.env.WEBAUTHN_RP_ID || "localhost",
    rpName: "Sloth Jobs",
    rpOrigin:
      process.env.WEBAUTHN_RP_ORIGIN || "http://localhost:3005",
  };
}

// In-memory challenge store (short-lived, single-user)
const challengeStore = new Map<
  string,
  { challenge: string; expires: number }
>();

function storeChallenge(key: string, challenge: string): void {
  challengeStore.set(key, {
    challenge,
    expires: Date.now() + 60_000, // 60 seconds
  });
}

function consumeChallenge(key: string): string | null {
  const entry = challengeStore.get(key);
  challengeStore.delete(key);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.challenge;
}

// ─── Schemas ──────────────────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  totpCode: z.string().length(6),
});

const reauthSchema = z.object({
  password: z.string().min(1),
  totpCode: z.string().length(6),
});

// ─── Helpers ──────────────────────────────────────────────

function getAdminRow() {
  return db.select().from(admin).limit(1).get();
}

function reqMeta(req: import("express").Request) {
  return {
    ip: req.ip ?? null,
    userAgent: req.header("user-agent") ?? null,
  };
}

/** Hash a refresh token for storage (SHA-256). */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ─── Routes ───────────────────────────────────────────────

/**
 * GET /api/auth/check
 * Public — tells client if an admin exists and whether passkeys are registered.
 */
router.get(
  "/check",
  asyncRoute(async (req, res) => {
    const adminRow = getAdminRow();
    if (!adminRow) {
      ok(res, { exists: false, hasPasskeys: false });
      return;
    }
    const passkeyRows = db
      .select()
      .from(passkeys)
      .where(eq(passkeys.adminId, adminRow.id))
      .all();
    ok(res, { exists: true, hasPasskeys: passkeyRows.length > 0 });
  }),
);

/**
 * POST /api/auth/login
 * Public — password + TOTP login.
 */
router.post(
  "/login",
  asyncRoute(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid login payload"));
      return;
    }
    const { username, password, totpCode } = parsed.data;

    const adminRow = getAdminRow();
    if (!adminRow) {
      fail(res, unauthorized("Invalid credentials"));
      return;
    }

    // Check lockout (lockedUntil is a unix timestamp in ms, stored as integer)
    if (adminRow.lockedUntil) {
      if (adminRow.lockedUntil > Date.now()) {
        logAuditEvent({
          action: "login.failed",
          adminId: null,
          ...reqMeta(req),
          metadata: { reason: "locked", username },
        });
        fail(res, badRequest("Account locked. Try again later."));
        return;
      }
      // Lock expired — reset
      db.update(admin)
        .set({ lockedUntil: null, failedAttempts: 0 })
        .where(eq(admin.id, adminRow.id))
        .run();
    }

    // Verify username (timing-safe)
    const usernameMatch =
      username.length === adminRow.username.length &&
      timingSafeEqual(Buffer.from(username), Buffer.from(adminRow.username));

    // Verify password
    const passwordMatch = await bcrypt.compare(
      password,
      adminRow.passwordHash,
    );

    if (!usernameMatch || !passwordMatch) {
      const attempts = (adminRow.failedAttempts || 0) + 1;
      const updates: Record<string, unknown> = {
        failedAttempts: attempts,
      };
      if (attempts >= 5) {
        updates.lockedUntil = Date.now() + 15 * 60 * 1000;
        logAuditEvent({
          action: "login.locked",
          adminId: adminRow.id,
          ...reqMeta(req),
          metadata: { attempts },
        });
      }
      db.update(admin)
        .set(updates)
        .where(eq(admin.id, adminRow.id))
        .run();
      logAuditEvent({
        action: "login.failed",
        adminId: null,
        ...reqMeta(req),
        metadata: { username, reason: "bad_credentials" },
      });
      fail(res, unauthorized("Invalid credentials"));
      return;
    }

    // Verify TOTP
    const totpSecret = decrypt(adminRow.totpSecret, getEncryptionKey());
    const totpResult = otpVerifySync({ secret: totpSecret, token: totpCode });
    const totpValid = totpResult.valid;
    if (!totpValid) {
      const attempts = (adminRow.failedAttempts || 0) + 1;
      const updates: Record<string, unknown> = {
        failedAttempts: attempts,
      };
      if (attempts >= 5) {
        updates.lockedUntil = Date.now() + 15 * 60 * 1000;
        logAuditEvent({
          action: "login.locked",
          adminId: adminRow.id,
          ...reqMeta(req),
          metadata: { attempts },
        });
      }
      db.update(admin)
        .set(updates)
        .where(eq(admin.id, adminRow.id))
        .run();
      logAuditEvent({
        action: "login.failed",
        adminId: adminRow.id,
        ...reqMeta(req),
        metadata: { reason: "bad_totp" },
      });
      fail(res, unauthorized("Invalid credentials"));
      return;
    }

    // Success — reset failed attempts
    db.update(admin)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(admin.id, adminRow.id))
      .run();

    // Issue tokens
    const secret = getJwtSecret();
    const accessToken = issueAccessToken(adminRow.id, secret);
    const { token: refreshToken, jti } = issueRefreshToken(
      adminRow.id,
      secret,
    );

    // Store refresh token hash
    db.insert(refreshTokens)
      .values({
        id: jti,
        adminId: adminRow.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })
      .run();

    // Set httpOnly cookie
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    logAuditEvent({
      action: "login.success",
      adminId: adminRow.id,
      ...reqMeta(req),
      metadata: { method: "password" },
    });
    ok(res, { accessToken });
  }),
);

/**
 * POST /api/auth/refresh
 * Public — uses httpOnly cookie.
 */
router.post(
  "/refresh",
  asyncRoute(async (req, res) => {
    const cookieHeader = req.headers.cookie || "";
    const match = cookieHeader.match(/refresh_token=([^;]+)/);
    if (!match) {
      fail(res, unauthorized("No refresh token"));
      return;
    }

    const token = match[1];
    const secret = getJwtSecret();
    const previous = process.env.JWT_SECRET_PREVIOUS || undefined;

    let payload;
    try {
      payload = verifyRefreshToken(token, secret, previous);
    } catch {
      fail(res, unauthorized("Invalid refresh token"));
      return;
    }

    // Check DB by JTI
    const stored = db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, payload.jti!))
      .get();

    if (!stored) {
      fail(res, unauthorized("Refresh token revoked"));
      return;
    }

    // Verify token hash matches
    const tokenHash = hashToken(token);
    if (stored.tokenHash !== tokenHash) {
      fail(res, unauthorized("Invalid refresh token"));
      return;
    }

    // Delete old token (rotation — revoke by deletion)
    db.delete(refreshTokens)
      .where(eq(refreshTokens.id, payload.jti!))
      .run();

    // Issue new pair
    const accessToken = issueAccessToken(payload.sub, secret);
    const { token: newRefresh, jti } = issueRefreshToken(
      payload.sub,
      secret,
    );

    db.insert(refreshTokens)
      .values({
        id: jti,
        adminId: payload.sub,
        tokenHash: hashToken(newRefresh),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })
      .run();

    res.cookie("refresh_token", newRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    logAuditEvent({
      action: "token.refresh",
      adminId: payload.sub,
      ...reqMeta(req),
    });
    ok(res, { accessToken });
  }),
);

/**
 * POST /api/auth/logout
 * Public — clears refresh cookie and revokes token.
 */
router.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const cookieHeader = req.headers.cookie || "";
    const match = cookieHeader.match(/refresh_token=([^;]+)/);

    if (match) {
      try {
        const secret = getJwtSecret();
        const previous = process.env.JWT_SECRET_PREVIOUS || undefined;
        const payload = verifyRefreshToken(match[1], secret, previous);
        // Revoke by deletion
        db.delete(refreshTokens)
          .where(eq(refreshTokens.id, payload.jti!))
          .run();
        logAuditEvent({
          action: "token.revoke",
          adminId: payload.sub,
          ...reqMeta(req),
        });
      } catch {
        // Token invalid — still clear cookie
      }
    }

    res.clearCookie("refresh_token", { path: "/api/auth" });
    ok(res, { message: "Logged out" });
  }),
);

/**
 * POST /api/auth/reauth
 * JWT required — validates password + TOTP, issues re-auth token.
 */
router.post(
  "/reauth",
  requireAuth,
  asyncRoute(async (req, res) => {
    const parsed = reauthSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid reauth payload"));
      return;
    }

    const adminRow = getAdminRow();
    if (!adminRow || adminRow.id !== req.auth!.adminId) {
      fail(res, unauthorized("Invalid credentials"));
      return;
    }

    const passwordMatch = await bcrypt.compare(
      parsed.data.password,
      adminRow.passwordHash,
    );
    const totpSecret = decrypt(adminRow.totpSecret, getEncryptionKey());
    const totpResult = otpVerifySync({ secret: totpSecret, token: parsed.data.totpCode });
    const totpValid = totpResult.valid;

    if (!passwordMatch || !totpValid) {
      logAuditEvent({
        action: "reauth.failed",
        adminId: adminRow.id,
        ...reqMeta(req),
      });
      fail(res, unauthorized("Invalid credentials"));
      return;
    }

    const reauthToken = issueReauthToken(adminRow.id, getJwtSecret());
    logAuditEvent({
      action: "reauth.success",
      adminId: adminRow.id,
      ...reqMeta(req),
    });
    ok(res, { reauthToken });
  }),
);

// ─── WebAuthn ─────────────────────────────────────────────

/**
 * POST /api/auth/webauthn/register/options
 * JWT required — generates registration options.
 */
router.post(
  "/webauthn/register/options",
  requireAuth,
  asyncRoute(async (req, res) => {
    const adminRow = getAdminRow();
    if (!adminRow || adminRow.id !== req.auth!.adminId) {
      fail(res, unauthorized("Admin not found"));
      return;
    }

    const existingPasskeys = db
      .select()
      .from(passkeys)
      .where(eq(passkeys.adminId, adminRow.id))
      .all();

    const { rpID, rpName } = getWebAuthnConfig();

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: adminRow.username,
      attestationType: "none",
      excludeCredentials: existingPasskeys.map((pk) => ({
        id: pk.credentialId,
        transports: pk.transports
          ? (JSON.parse(pk.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    storeChallenge(`reg:${adminRow.id}`, options.challenge);
    ok(res, options);
  }),
);

/**
 * POST /api/auth/webauthn/register/verify
 * JWT required — verifies registration response.
 */
router.post(
  "/webauthn/register/verify",
  requireAuth,
  asyncRoute(async (req, res) => {
    const adminRow = getAdminRow();
    if (!adminRow || adminRow.id !== req.auth!.adminId) {
      fail(res, unauthorized("Admin not found"));
      return;
    }

    const expectedChallenge = consumeChallenge(`reg:${adminRow.id}`);
    if (!expectedChallenge) {
      fail(res, badRequest("Challenge expired or missing"));
      return;
    }

    const { rpID, rpOrigin } = getWebAuthnConfig();

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: rpOrigin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      fail(res, badRequest("Verification failed"));
      return;
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    const { createId } = await import("@paralleldrive/cuid2");

    db.insert(passkeys)
      .values({
        id: createId(),
        adminId: adminRow.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports
          ? JSON.stringify(credential.transports)
          : null,
        friendlyName: req.body.friendlyName || null,
      })
      .run();

    logAuditEvent({
      action: "passkey.register",
      adminId: adminRow.id,
      ...reqMeta(req),
    });
    ok(res, { verified: true });
  }),
);

/**
 * POST /api/auth/webauthn/login/options
 * Public — generates authentication options.
 */
router.post(
  "/webauthn/login/options",
  asyncRoute(async (req, res) => {
    const adminRow = getAdminRow();
    if (!adminRow) {
      fail(res, unauthorized("No admin configured"));
      return;
    }

    const userPasskeys = db
      .select()
      .from(passkeys)
      .where(eq(passkeys.adminId, adminRow.id))
      .all();

    if (userPasskeys.length === 0) {
      fail(res, badRequest("No passkeys registered"));
      return;
    }

    const { rpID } = getWebAuthnConfig();

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: userPasskeys.map((pk) => ({
        id: pk.credentialId,
        transports: pk.transports
          ? (JSON.parse(pk.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
      userVerification: "preferred",
    });

    storeChallenge(`auth:${adminRow.id}`, options.challenge);
    ok(res, options);
  }),
);

/**
 * POST /api/auth/webauthn/login/verify
 * Public — verifies authentication response and issues tokens.
 */
router.post(
  "/webauthn/login/verify",
  asyncRoute(async (req, res) => {
    const adminRow = getAdminRow();
    if (!adminRow) {
      fail(res, unauthorized("No admin configured"));
      return;
    }

    // Check lockout
    if (adminRow.lockedUntil && adminRow.lockedUntil > Date.now()) {
      logAuditEvent({
        action: "webauthn.login.failed",
        adminId: adminRow.id,
        ...reqMeta(req),
        metadata: { reason: "locked" },
      });
      fail(res, badRequest("Account locked"));
      return;
    }

    const expectedChallenge = consumeChallenge(`auth:${adminRow.id}`);
    if (!expectedChallenge) {
      fail(res, badRequest("Challenge expired or missing"));
      return;
    }

    // Look up passkey by credential ID from the request body
    const credentialId = req.body.id;
    const passkey = db
      .select()
      .from(passkeys)
      .where(eq(passkeys.credentialId, credentialId))
      .get();

    if (!passkey || passkey.adminId !== adminRow.id) {
      logAuditEvent({
        action: "webauthn.login.failed",
        adminId: adminRow.id,
        ...reqMeta(req),
        metadata: { reason: "unknown_credential" },
      });
      fail(res, unauthorized("Unknown passkey"));
      return;
    }

    const { rpID, rpOrigin } = getWebAuthnConfig();

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: req.body,
        expectedChallenge,
        expectedOrigin: rpOrigin,
        expectedRPID: rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports
            ? (JSON.parse(
                passkey.transports,
              ) as AuthenticatorTransportFuture[])
            : undefined,
        },
      });
    } catch (error) {
      logAuditEvent({
        action: "webauthn.login.failed",
        adminId: adminRow.id,
        ...reqMeta(req),
        metadata: { reason: "verification_error" },
      });
      fail(res, unauthorized("Passkey verification failed"));
      return;
    }

    if (!verification.verified) {
      logAuditEvent({
        action: "webauthn.login.failed",
        adminId: adminRow.id,
        ...reqMeta(req),
        metadata: { reason: "not_verified" },
      });
      fail(res, unauthorized("Passkey verification failed"));
      return;
    }

    // Update counter
    db.update(passkeys)
      .set({ counter: verification.authenticationInfo.newCounter })
      .where(eq(passkeys.id, passkey.id))
      .run();

    // Reset failed attempts
    db.update(admin)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(admin.id, adminRow.id))
      .run();

    // Issue tokens
    const secret = getJwtSecret();
    const accessToken = issueAccessToken(adminRow.id, secret);
    const { token: refreshToken, jti } = issueRefreshToken(
      adminRow.id,
      secret,
    );

    db.insert(refreshTokens)
      .values({
        id: jti,
        adminId: adminRow.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })
      .run();

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    logAuditEvent({
      action: "webauthn.login.success",
      adminId: adminRow.id,
      ...reqMeta(req),
    });
    ok(res, { accessToken });
  }),
);

// ─── Passkey Management (JWT required) ────────────────────

/** GET /api/auth/passkeys — list registered passkeys */
router.get(
  "/passkeys",
  requireAuth,
  asyncRoute(async (req, res) => {
    const rows = db
      .select({
        id: passkeys.id,
        credentialId: passkeys.credentialId,
        friendlyName: passkeys.friendlyName,
        deviceType: passkeys.deviceType,
        backedUp: passkeys.backedUp,
        createdAt: passkeys.createdAt,
      })
      .from(passkeys)
      .where(eq(passkeys.adminId, req.auth!.adminId))
      .all();
    ok(res, { passkeys: rows });
  }),
);

/** DELETE /api/auth/passkeys/:id — remove a passkey (re-auth required handled by caller) */
router.delete(
  "/passkeys/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    if (!id) {
      fail(res, badRequest("Missing passkey id"));
      return;
    }
    const passkey = db
      .select()
      .from(passkeys)
      .where(eq(passkeys.id, id))
      .get();
    if (!passkey || passkey.adminId !== req.auth!.adminId) {
      fail(res, badRequest("Passkey not found"));
      return;
    }
    db.delete(passkeys).where(eq(passkeys.id, id)).run();
    logAuditEvent({
      action: "passkey.remove",
      adminId: req.auth!.adminId,
      ...reqMeta(req),
      metadata: { passkeyId: id },
    });
    ok(res, { deleted: true });
  }),
);

// ─── Audit Log (JWT required) ─────────────────────────────

/** GET /api/auth/audit — recent audit events */
router.get(
  "/audit",
  requireAuth,
  asyncRoute(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = db
      .select()
      .from(auditLog)
      .orderBy(sql`created_at DESC`)
      .limit(limit)
      .all();
    ok(res, { events: rows });
  }),
);

// ─── Sessions (JWT required) ──────────────────────────────

/** GET /api/auth/sessions — active refresh tokens */
router.get(
  "/sessions",
  requireAuth,
  asyncRoute(async (req, res) => {
    const now = Date.now();
    const rows = db
      .select({
        id: refreshTokens.id,
        createdAt: refreshTokens.createdAt,
        expiresAt: refreshTokens.expiresAt,
      })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.adminId, req.auth!.adminId),
          sql`${refreshTokens.expiresAt} > ${now}`,
        ),
      )
      .all();
    ok(res, { sessions: rows });
  }),
);

/** POST /api/auth/sessions/revoke-all — revoke all refresh tokens */
router.post(
  "/sessions/revoke-all",
  requireAuth,
  asyncRoute(async (req, res) => {
    db.delete(refreshTokens)
      .where(eq(refreshTokens.adminId, req.auth!.adminId))
      .run();
    logAuditEvent({
      action: "token.revoke",
      adminId: req.auth!.adminId,
      ...reqMeta(req),
      metadata: { scope: "all" },
    });
    ok(res, { revoked: true });
  }),
);

export { router as authRouter };

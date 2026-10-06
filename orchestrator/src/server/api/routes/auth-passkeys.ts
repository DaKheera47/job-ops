import {
  badRequest,
  conflict,
  notFound,
  serviceUnavailable,
  unauthorized,
} from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getUserId } from "@infra/request-context";
import { signToken } from "@server/auth/jwt";
import {
  consumePasskeyAuthenticationChallenge,
  consumePasskeyRegistrationChallenge,
  storePasskeyAuthenticationChallenge,
  storePasskeyRegistrationChallenge,
} from "@server/auth/passkeys/challenge-store";
import { resolveWebAuthnRelyingParty } from "@server/auth/passkeys/relying-party";
import { isDemoMode } from "@server/config/demo";
import * as passkeysRepo from "@server/repositories/passkey-credentials";
import * as usersRepo from "@server/repositories/users";
import type { PasskeyDeviceType, PasskeySummary } from "@shared/types";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  type VerifiedRegistrationResponse,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

type VerifiedPasskeyRegistration = Extract<
  VerifiedRegistrationResponse,
  { verified: true }
>["registrationInfo"];

const WEBAUTHN_TRANSPORTS = new Set([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

const credentialResponseSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal("public-key"),
  response: z.object({}).passthrough(),
  clientExtensionResults: z.object({}).passthrough(),
});

const loginVerifySchema = z.object({
  challengeId: z.string().min(1),
  response: credentialResponseSchema,
});

const registerVerifySchema = z.object({
  name: z.string().trim().max(80).optional(),
  response: credentialResponseSchema,
});

const renameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/**
 * Transports are persisted exactly as the browser reported them, so drop
 * anything outside the spec enum before handing them back to a browser.
 */
function toTransports(value: string[] | null): string[] | undefined {
  const transports = value?.filter((entry) => WEBAUTHN_TRANSPORTS.has(entry));
  return transports && transports.length > 0 ? transports : undefined;
}

/**
 * Library failures carry details about the ceremony that the client must not
 * see; they are logged instead of surfaced.
 */
function logVerificationFailure(credentialId: string, reason: unknown): void {
  logger.warn("Passkey verification failed", {
    credentialId,
    reason: reason instanceof Error ? reason.message : String(reason),
  });
}

function isDuplicateCredentialError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /UNIQUE constraint failed: passkey_credentials\.id/i.test(
    error.message,
  );
}

async function requireCurrentUser(
  res: Response,
): Promise<usersRepo.PublicUser | null> {
  const userId = getUserId();
  if (!userId) {
    fail(res, unauthorized("Authentication required"));
    return null;
  }

  const user = await usersRepo.getUserById(userId);
  if (!user || user.isDisabled) {
    fail(res, unauthorized("Authentication required"));
    return null;
  }
  return user;
}

export const authPasskeysRouter = Router();

authPasskeysRouter.post(
  "/login/options",
  asyncRoute(async (req: Request, res: Response) => {
    if (isDemoMode()) {
      fail(
        res,
        serviceUnavailable("Passkey sign-in is disabled in the public demo."),
      );
      return;
    }

    if ((await usersRepo.countUsers()) === 0) {
      fail(res, badRequest("Initial setup is required before sign-in"));
      return;
    }

    const relyingParty = resolveWebAuthnRelyingParty(req);
    // Discoverable credentials: the authenticator picks the account, so no
    // allowCredentials list is sent.
    const options = await generateAuthenticationOptions({
      rpID: relyingParty.rpID,
      userVerification: "required",
    });
    const challengeId = storePasskeyAuthenticationChallenge({
      challenge: options.challenge,
      rpID: relyingParty.rpID,
      expectedOrigin: relyingParty.expectedOrigin,
      clientKey: req.ip ?? "unknown",
    });

    ok(res, { challengeId, options });
  }),
);

authPasskeysRouter.post(
  "/login/verify",
  asyncRoute(async (req: Request, res: Response) => {
    if (isDemoMode()) {
      fail(
        res,
        serviceUnavailable("Passkey sign-in is disabled in the public demo."),
      );
      return;
    }

    const parsed = loginVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const pending = consumePasskeyAuthenticationChallenge(
      parsed.data.challengeId,
    );
    if (!pending) {
      fail(res, badRequest("Passkey challenge expired"));
      return;
    }

    const response = parsed.data
      .response as unknown as AuthenticationResponseJSON;
    const credential = await passkeysRepo.getPasskeyById(response.id);
    if (!credential) {
      fail(res, unauthorized("Passkey not recognized"));
      return;
    }

    const user = await usersRepo.getUserById(credential.userId);
    if (!user || user.isDisabled || user.workspaceId !== credential.tenantId) {
      fail(res, unauthorized("Passkey not recognized"));
      return;
    }

    let authentication: {
      newCounter: number;
      deviceType: PasskeyDeviceType;
      backedUp: boolean;
    };
    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: pending.expectedOrigin,
        expectedRPID: pending.rpID,
        credential: {
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey, "base64url"),
          counter: credential.counter,
          transports: toTransports(credential.transports),
        },
        requireUserVerification: true,
      });
      if (!verification.verified) {
        logVerificationFailure(credential.id, "Assertion signature rejected");
        fail(res, unauthorized("Passkey not recognized"));
        return;
      }
      authentication = {
        newCounter: verification.authenticationInfo.newCounter,
        deviceType: verification.authenticationInfo.credentialDeviceType,
        backedUp: verification.authenticationInfo.credentialBackedUp,
      };
    } catch (error) {
      logVerificationFailure(credential.id, error);
      fail(res, unauthorized("Passkey not recognized"));
      return;
    }

    await passkeysRepo.recordPasskeyAuthentication({
      id: credential.id,
      counter: authentication.newCounter,
      lastUsedAt: Math.floor(Date.now() / 1000),
      deviceType: authentication.deviceType,
      backedUp: authentication.backedUp,
    });

    let token: string;
    let expiresIn: number;
    try {
      ({ token, expiresIn } = await signToken({
        sub: user.id,
        userId: user.id,
        tenantId: user.workspaceId,
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

    ok(res, { token, expiresIn, user });
  }),
);

authPasskeysRouter.post(
  "/register/options",
  asyncRoute(async (req: Request, res: Response) => {
    const user = await requireCurrentUser(res);
    if (!user) return;

    const relyingParty = resolveWebAuthnRelyingParty(req);
    const existing = await passkeysRepo.listPasskeysForUser(user.id);
    const options = await generateRegistrationOptions({
      rpName: relyingParty.rpName,
      rpID: relyingParty.rpID,
      userName: user.username,
      userID: new TextEncoder().encode(user.id),
      userDisplayName: user.displayName ?? user.username,
      attestationType: "none",
      excludeCredentials: existing.map((credential) => ({
        id: credential.id,
        transports: toTransports(credential.transports),
      })),
      // A passkey is the sole factor here, so the authenticator must be
      // discoverable and must verify the user.
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    storePasskeyRegistrationChallenge({
      userId: user.id,
      challenge: options.challenge,
      rpID: relyingParty.rpID,
      expectedOrigin: relyingParty.expectedOrigin,
    });

    ok(res, { options });
  }),
);

authPasskeysRouter.post(
  "/register/verify",
  asyncRoute(async (req: Request, res: Response) => {
    const user = await requireCurrentUser(res);
    if (!user) return;

    const parsed = registerVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const pending = consumePasskeyRegistrationChallenge(user.id);
    if (!pending) {
      fail(res, badRequest("Passkey challenge expired"));
      return;
    }

    const response = parsed.data
      .response as unknown as RegistrationResponseJSON;
    let registrationInfo: VerifiedPasskeyRegistration;
    try {
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: pending.expectedOrigin,
        expectedRPID: pending.rpID,
        requireUserVerification: true,
      });
      if (!verification.verified) {
        logVerificationFailure(response.id, "Attestation signature rejected");
        fail(res, badRequest("Passkey could not be verified"));
        return;
      }
      registrationInfo = verification.registrationInfo;
    } catch (error) {
      logVerificationFailure(response.id, error);
      fail(res, badRequest("Passkey could not be verified"));
      return;
    }

    const { credential } = registrationInfo;
    const name =
      parsed.data.name ||
      `Passkey ${(await passkeysRepo.countPasskeysForUser(user.id)) + 1}`;

    let summary: PasskeySummary;
    try {
      summary = await passkeysRepo.createPasskey({
        id: credential.id,
        tenantId: user.workspaceId,
        userId: user.id,
        name,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports ?? null,
        deviceType: registrationInfo.credentialDeviceType,
        backedUp: registrationInfo.credentialBackedUp,
        aaguid: registrationInfo.aaguid || null,
      });
    } catch (error) {
      if (isDuplicateCredentialError(error)) {
        fail(res, conflict("This passkey is already registered"));
        return;
      }
      throw error;
    }

    ok(res, summary, 201);
  }),
);

authPasskeysRouter.get(
  "/",
  asyncRoute(async (_req: Request, res: Response) => {
    const user = await requireCurrentUser(res);
    if (!user) return;

    ok(res, await passkeysRepo.listPasskeysForUser(user.id));
  }),
);

authPasskeysRouter.patch(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const user = await requireCurrentUser(res);
    if (!user) return;

    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const passkeyId = req.params.id;
    if (!passkeyId) {
      fail(res, badRequest("Passkey id is required"));
      return;
    }

    const summary = await passkeysRepo.renamePasskey({
      id: passkeyId,
      userId: user.id,
      name: parsed.data.name,
    });
    if (!summary) {
      fail(res, notFound("Passkey not found"));
      return;
    }

    ok(res, summary);
  }),
);

authPasskeysRouter.delete(
  "/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const user = await requireCurrentUser(res);
    if (!user) return;

    const passkeyId = req.params.id;
    if (!passkeyId) {
      fail(res, badRequest("Passkey id is required"));
      return;
    }

    const deleted = await passkeysRepo.deletePasskey({
      id: passkeyId,
      userId: user.id,
    });
    if (!deleted) {
      fail(res, notFound("Passkey not found"));
      return;
    }

    ok(res, { deleted: true });
  }),
);

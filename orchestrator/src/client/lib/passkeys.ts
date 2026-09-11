import type { AuthUser } from "@client/api";
import * as api from "@client/api";
import type { PasskeySummary } from "@shared/types";
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { trackProductEvent } from "@/lib/analytics";

/**
 * Raised when the user dismisses the browser's passkey prompt. Callers are
 * expected to swallow it: the user already knows they cancelled.
 */
export class PasskeyCancelledError extends Error {
  constructor() {
    super("Passkey prompt was dismissed");
    this.name = "PasskeyCancelledError";
  }
}

/**
 * WebAuthn is unavailable outside a secure context, with localhost as the
 * standard exception so `npm run dev` works over plain http.
 */
export function isPasskeySupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!browserSupportsWebAuthn()) return false;
  return window.isSecureContext || window.location.hostname === "localhost";
}

function toCeremonyError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  if (error.name === "NotAllowedError" || error.name === "AbortError") {
    return new PasskeyCancelledError();
  }
  if (error.name === "InvalidStateError") {
    return new Error("This device already has a passkey for your account");
  }
  return error;
}

export async function signInWithPasskey(): Promise<AuthUser> {
  const { challengeId, options } = await api.getPasskeyLoginOptions();

  let response: Awaited<ReturnType<typeof startAuthentication>>;
  try {
    response = await startAuthentication({
      optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
    });
  } catch (error) {
    throw toCeremonyError(error);
  }

  const user = await api.verifyPasskeyLogin({ challengeId, response });
  trackProductEvent("passkey_login_completed", {});
  return user;
}

export async function registerPasskey(name?: string): Promise<PasskeySummary> {
  const { options } = await api.getPasskeyRegistrationOptions();

  let response: Awaited<ReturnType<typeof startRegistration>>;
  try {
    response = await startRegistration({
      optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
    });
  } catch (error) {
    throw toCeremonyError(error);
  }

  const passkey = await api.verifyPasskeyRegistration({ name, response });
  trackProductEvent("passkey_register_completed", {
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp,
  });
  return passkey;
}

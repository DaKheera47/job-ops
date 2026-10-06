import { randomUUID } from "node:crypto";
import { serviceUnavailable } from "@infra/errors";

export type PasskeyChallenge = {
  challenge: string;
  rpID: string;
  expectedOrigin: string[];
  createdAt: number;
};

type PendingChallenge = Omit<PasskeyChallenge, "createdAt">;

/** `clientKey` identifies the caller that started the ceremony (its IP). */
type PendingAuthenticationChallenge = PendingChallenge & { clientKey: string };

const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 5000;
/**
 * Sign-in ceremonies are started without authentication, so a single caller
 * must not be able to occupy the shared cap and wedge sign-in for everyone.
 * The limit is per source address, which behind a reverse proxy is the proxy.
 */
const MAX_PENDING_CHALLENGES_PER_CLIENT = 100;
const TOO_MANY_CHALLENGES_MESSAGE =
  "Too many passkey requests in progress, try again shortly";
const CHALLENGE_ID_PATTERN = /^[0-9a-f-]{36}$/;

/**
 * Pending ceremonies are held per process, so a multi-instance deployment must
 * route both halves of a ceremony to the same instance.
 */
const registrationChallenges = new Map<string, PasskeyChallenge>();
const authenticationChallenges = new Map<
  string,
  PasskeyChallenge & { clientKey: string }
>();

function getChallengeTtlMs(): number {
  const parsed = Number.parseInt(
    process.env.WEBAUTHN_CHALLENGE_TTL_MS ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_CHALLENGE_TTL_MS;
}

function purgeExpired(entries: Map<string, { createdAt: number }>): void {
  const oldestAllowed = Date.now() - getChallengeTtlMs();
  for (const [key, entry] of entries) {
    if (entry.createdAt <= oldestAllowed) entries.delete(key);
  }
}

function put<TPending extends PendingChallenge>(
  entries: Map<string, TPending & { createdAt: number }>,
  key: string,
  pending: TPending,
): void {
  purgeExpired(entries);
  // Reject new ceremonies rather than evicting challenges other users are
  // still in the middle of.
  if (!entries.has(key) && entries.size >= MAX_PENDING_CHALLENGES) {
    throw serviceUnavailable(TOO_MANY_CHALLENGES_MESSAGE);
  }

  entries.set(key, { ...pending, createdAt: Date.now() });
}

function take<TEntry extends PasskeyChallenge>(
  entries: Map<string, TEntry>,
  key: string,
): TEntry | null {
  purgeExpired(entries);
  const entry = entries.get(key);
  if (!entry) return null;
  entries.delete(key);
  return entry;
}

/** Replaces any registration ceremony the user already has in flight. */
export function storePasskeyRegistrationChallenge(
  input: PendingChallenge & { userId: string },
): void {
  const { userId, ...pending } = input;
  put(registrationChallenges, userId, pending);
}

export function consumePasskeyRegistrationChallenge(
  userId: string,
): PasskeyChallenge | null {
  return take(registrationChallenges, userId);
}

/** Returns the opaque id the client must send back with its assertion. */
export function storePasskeyAuthenticationChallenge(
  pending: PendingAuthenticationChallenge,
): string {
  purgeExpired(authenticationChallenges);
  let pendingForClient = 0;
  for (const entry of authenticationChallenges.values()) {
    if (entry.clientKey === pending.clientKey) pendingForClient += 1;
  }
  if (pendingForClient >= MAX_PENDING_CHALLENGES_PER_CLIENT) {
    throw serviceUnavailable(TOO_MANY_CHALLENGES_MESSAGE);
  }

  const challengeId = randomUUID();
  put(authenticationChallenges, challengeId, pending);
  return challengeId;
}

export function consumePasskeyAuthenticationChallenge(
  challengeId: string,
): PasskeyChallenge | null {
  if (!CHALLENGE_ID_PATTERN.test(challengeId)) return null;
  return take(authenticationChallenges, challengeId);
}

/** Test-only: drop every pending ceremony. */
export function __resetPasskeyChallengeStoresForTests(): void {
  registrationChallenges.clear();
  authenticationChallenges.clear();
}

import type { AppError } from "@infra/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPasskeyChallengeStoresForTests,
  consumePasskeyAuthenticationChallenge,
  consumePasskeyRegistrationChallenge,
  storePasskeyAuthenticationChallenge,
  storePasskeyRegistrationChallenge,
} from "./challenge-store";

const originalEnv = { ...process.env };
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 5000;
const MAX_PENDING_CHALLENGES_PER_CLIENT = 100;

const pending = {
  challenge: "challenge-value",
  rpID: "localhost",
  expectedOrigin: ["http://localhost:5173"],
};

const authenticationPending = { ...pending, clientKey: "203.0.113.7" };

function captureThrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the challenge store to throw");
}

describe("passkey challenge stores", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.WEBAUTHN_CHALLENGE_TTL_MS;
    __resetPasskeyChallengeStoresForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetPasskeyChallengeStoresForTests();
    process.env = { ...originalEnv };
  });

  it("consumes a registration challenge exactly once", () => {
    storePasskeyRegistrationChallenge({ userId: "user-1", ...pending });

    expect(consumePasskeyRegistrationChallenge("user-1")).toMatchObject(
      pending,
    );
    expect(consumePasskeyRegistrationChallenge("user-1")).toBeNull();
  });

  it("keeps only the latest registration challenge per user", () => {
    storePasskeyRegistrationChallenge({ userId: "user-1", ...pending });
    storePasskeyRegistrationChallenge({
      userId: "user-1",
      ...pending,
      challenge: "newer-challenge",
    });

    expect(consumePasskeyRegistrationChallenge("user-1")?.challenge).toBe(
      "newer-challenge",
    );
  });

  it("consumes an authentication challenge exactly once", () => {
    const challengeId = storePasskeyAuthenticationChallenge(
      authenticationPending,
    );

    expect(challengeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(consumePasskeyAuthenticationChallenge(challengeId)).toMatchObject(
      pending,
    );
    expect(consumePasskeyAuthenticationChallenge(challengeId)).toBeNull();
  });

  it("rejects malformed authentication challenge ids", () => {
    expect(consumePasskeyAuthenticationChallenge("not-a-challenge-id")).toBe(
      null,
    );
  });

  it("does not expose registration challenges to the login path", () => {
    const userId = "8f14e45f-ceea-467a-9c30-07d1d0b7f3ba";
    storePasskeyRegistrationChallenge({ userId, ...pending });

    expect(consumePasskeyAuthenticationChallenge(userId)).toBeNull();
    expect(consumePasskeyRegistrationChallenge(userId)).toMatchObject(pending);
  });

  it("expires challenges once the TTL has elapsed", () => {
    storePasskeyRegistrationChallenge({ userId: "user-1", ...pending });
    const challengeId = storePasskeyAuthenticationChallenge(
      authenticationPending,
    );

    vi.advanceTimersByTime(DEFAULT_TTL_MS + 1);

    expect(consumePasskeyRegistrationChallenge("user-1")).toBeNull();
    expect(consumePasskeyAuthenticationChallenge(challengeId)).toBeNull();
  });

  it("honours WEBAUTHN_CHALLENGE_TTL_MS", () => {
    process.env.WEBAUTHN_CHALLENGE_TTL_MS = "1000";
    const challengeId = storePasskeyAuthenticationChallenge(
      authenticationPending,
    );

    vi.advanceTimersByTime(500);
    expect(consumePasskeyAuthenticationChallenge(challengeId)).toMatchObject(
      pending,
    );

    const nextChallengeId = storePasskeyAuthenticationChallenge(
      authenticationPending,
    );
    vi.advanceTimersByTime(1001);
    expect(consumePasskeyAuthenticationChallenge(nextChallengeId)).toBeNull();
  });

  it("rejects new ceremonies at capacity instead of evicting younger ones", () => {
    const firstChallengeId = storePasskeyAuthenticationChallenge({
      ...pending,
      clientKey: "client-0",
    });
    for (let index = 1; index < MAX_PENDING_CHALLENGES; index += 1) {
      storePasskeyAuthenticationChallenge({
        ...pending,
        clientKey: `client-${index}`,
      });
    }

    expect(
      captureThrown(() =>
        storePasskeyAuthenticationChallenge({
          ...pending,
          clientKey: "client-late",
        }),
      ),
    ).toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    } satisfies Partial<AppError>);
    expect(
      consumePasskeyAuthenticationChallenge(firstChallengeId),
    ).toMatchObject(pending);
  });

  it("caps how many sign-in ceremonies one client may keep pending", () => {
    const firstChallengeId = storePasskeyAuthenticationChallenge(
      authenticationPending,
    );
    for (let index = 1; index < MAX_PENDING_CHALLENGES_PER_CLIENT; index += 1) {
      storePasskeyAuthenticationChallenge(authenticationPending);
    }

    expect(
      captureThrown(() =>
        storePasskeyAuthenticationChallenge(authenticationPending),
      ),
    ).toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    } satisfies Partial<AppError>);

    // Another client is unaffected, and the flooder's own pending ceremonies
    // are still there to be completed.
    const otherChallengeId = storePasskeyAuthenticationChallenge({
      ...pending,
      clientKey: "198.51.100.4",
    });
    expect(
      consumePasskeyAuthenticationChallenge(otherChallengeId),
    ).toMatchObject(pending);
    expect(
      consumePasskeyAuthenticationChallenge(firstChallengeId),
    ).toMatchObject(pending);
  });

  it("makes room again once pending challenges expire", () => {
    for (let index = 0; index < MAX_PENDING_CHALLENGES; index += 1) {
      storePasskeyAuthenticationChallenge({
        ...pending,
        clientKey: `client-${index}`,
      });
    }

    vi.advanceTimersByTime(DEFAULT_TTL_MS + 1);

    const challengeId = storePasskeyAuthenticationChallenge(
      authenticationPending,
    );
    expect(consumePasskeyAuthenticationChallenge(challengeId)).toMatchObject(
      pending,
    );
  });
});

import { AppError } from "@infra/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSsoFlowStoreForTests,
  consumeSsoFlow,
  rememberSsoFlow,
  type SsoFlowState,
} from "./flow-store";

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 5000;

function loginFlow(
  overrides: Partial<Omit<SsoFlowState, "createdAt">> = {},
): Omit<SsoFlowState, "createdAt"> {
  return {
    provider: "google",
    mode: "login",
    flowToken: "flow-token",
    codeVerifier: "code-verifier",
    nonce: "nonce",
    redirectUri: "https://jobops.example.com/sso/callback/google",
    userId: null,
    tenantId: null,
    ...overrides,
  };
}

describe("SSO flow store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetSsoFlowStoreForTests();
  });

  afterEach(() => {
    __resetSsoFlowStoreForTests();
    vi.useRealTimers();
  });

  it("hands out a flow exactly once", () => {
    rememberSsoFlow("state-1", loginFlow());

    expect(consumeSsoFlow("state-1")).toMatchObject({
      provider: "google",
      mode: "login",
      flowToken: "flow-token",
    });
    expect(consumeSsoFlow("state-1")).toBeNull();
  });

  it("drops a flow once it has expired", () => {
    rememberSsoFlow("state-1", loginFlow());

    vi.advanceTimersByTime(TTL_MS - 1);
    expect(consumeSsoFlow("state-1")).not.toBeNull();

    rememberSsoFlow("state-2", loginFlow());
    vi.advanceTimersByTime(TTL_MS);
    expect(consumeSsoFlow("state-2")).toBeNull();
  });

  it("purges expired flows before rejecting a full store", () => {
    for (let index = 0; index < MAX_ENTRIES; index += 1) {
      rememberSsoFlow(`stale-${index}`, loginFlow());
    }

    vi.advanceTimersByTime(TTL_MS);
    expect(() => rememberSsoFlow("fresh", loginFlow())).not.toThrow();
    expect(consumeSsoFlow("stale-0")).toBeNull();
  });

  it("turns away new sign-ins rather than evicting in-flight ones", () => {
    for (let index = 0; index < MAX_ENTRIES; index += 1) {
      rememberSsoFlow(`live-${index}`, loginFlow());
    }

    let thrown: unknown;
    try {
      rememberSsoFlow("overflow", loginFlow());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).status).toBe(503);
    expect(consumeSsoFlow("live-0")).not.toBeNull();
    expect(consumeSsoFlow("overflow")).toBeNull();
  });
});

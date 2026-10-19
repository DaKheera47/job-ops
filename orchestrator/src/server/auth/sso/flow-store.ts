import { serviceUnavailable } from "@infra/errors";
import type { SsoProvider } from "@shared/types";

export type SsoFlowMode = "login" | "link";

export type SsoFlowState = {
  provider: SsoProvider;
  mode: SsoFlowMode;
  flowToken: string;
  codeVerifier: string;
  nonce: string | null;
  redirectUri: string;
  userId: string | null;
  tenantId: string | null;
  createdAt: number;
};

const SSO_STATE_TTL_MS = 10 * 60 * 1000;
const SSO_STATE_MAX_ENTRIES = 5000;

/**
 * Per-process state, so a multi-instance deployment must pin a browser to one
 * instance for the duration of a sign-in (same limitation as the Gmail OAuth
 * state store).
 */
const flows = new Map<string, SsoFlowState>();

function purgeExpiredFlows(now: number): void {
  for (const [state, flow] of flows) {
    if (now - flow.createdAt >= SSO_STATE_TTL_MS) {
      flows.delete(state);
    }
  }
}

export function rememberSsoFlow(
  state: string,
  flow: Omit<SsoFlowState, "createdAt">,
): SsoFlowState {
  const now = Date.now();
  purgeExpiredFlows(now);

  // Evicting live entries would break sign-ins that are already in flight, so
  // the newcomer is turned away instead.
  if (flows.size >= SSO_STATE_MAX_ENTRIES) {
    throw serviceUnavailable(
      "Too many sign-in attempts in progress, try again shortly",
    );
  }

  const stored: SsoFlowState = { ...flow, createdAt: now };
  flows.set(state, stored);
  return stored;
}

export function consumeSsoFlow(state: string): SsoFlowState | null {
  const flow = flows.get(state);
  if (!flow) return null;

  flows.delete(state);
  if (Date.now() - flow.createdAt >= SSO_STATE_TTL_MS) return null;
  return flow;
}

/** Test-only: drop every in-flight sign-in. */
export function __resetSsoFlowStoreForTests(): void {
  flows.clear();
}

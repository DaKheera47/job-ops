import type { SsoProvider } from "@shared/types";

export type PendingSsoFlow = {
  provider: SsoProvider;
  state: string;
  flowToken: string;
  mode: "login" | "link";
  next: string | null;
  startedAt: number;
};

const PENDING_SSO_FLOW_KEY = "jobops.ssoFlow";

function isPendingSsoFlow(value: unknown): value is PendingSsoFlow {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PendingSsoFlow>;
  return (
    typeof candidate.provider === "string" &&
    typeof candidate.state === "string" &&
    typeof candidate.flowToken === "string" &&
    (candidate.mode === "login" || candidate.mode === "link") &&
    (candidate.next === null || typeof candidate.next === "string") &&
    typeof candidate.startedAt === "number"
  );
}

export function rememberPendingSsoFlow(
  flow: Omit<PendingSsoFlow, "startedAt">,
): void {
  try {
    sessionStorage.setItem(
      PENDING_SSO_FLOW_KEY,
      JSON.stringify({
        ...flow,
        startedAt: Date.now(),
      } satisfies PendingSsoFlow),
    );
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
}

/**
 * The record is the browser half of the flow token the server checks, so it is
 * good for exactly one callback.
 */
export function consumePendingSsoFlow(): PendingSsoFlow | null {
  try {
    const stored = sessionStorage.getItem(PENDING_SSO_FLOW_KEY);
    sessionStorage.removeItem(PENDING_SSO_FLOW_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as unknown;
    return isPendingSsoFlow(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

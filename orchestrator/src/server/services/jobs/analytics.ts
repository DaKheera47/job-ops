import { trackCanonicalActivationEvent } from "@server/services/activation-funnel";
import type { JobOutcome } from "@shared/types";

export function trackApplicationAcceptedIfNeeded(args: {
  closedAt?: number | null;
  nextOutcome: JobOutcome | null;
  previousOutcome: JobOutcome | null;
  requestOrigin?: string | null;
  source: string;
}): void {
  if (
    args.nextOutcome !== "offer_accepted" ||
    args.previousOutcome === "offer_accepted"
  ) {
    return;
  }

  void trackCanonicalActivationEvent(
    "application_accepted",
    {
      source: args.source,
    },
    {
      occurredAt:
        typeof args.closedAt === "number" ? args.closedAt * 1000 : Date.now(),
      requestOrigin: args.requestOrigin ?? null,
      urlPath: "/applications/in-progress",
    },
  );
}

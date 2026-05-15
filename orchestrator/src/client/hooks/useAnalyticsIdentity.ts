import * as api from "@client/api";
import { useEffect } from "react";
import { identifyAnalyticsUser } from "@/lib/analytics";

export function useAnalyticsIdentity(): void {
  const hasSession = api.hasAuthenticatedSession();

  useEffect(() => {
    let cancelled = false;

    if (hasSession) {
      void api
        .getCurrentAuthContext()
        .then((context) => {
          if (cancelled) return;
          identifyAnalyticsUser(context.analyticsDistinctId);
        })
        .catch(() => {
          // Ignore auth fetch errors; analytics identity is best-effort.
        });

      return () => {
        cancelled = true;
      };
    }

    identifyAnalyticsUser(null);
    return () => {
      cancelled = true;
    };
  }, [hasSession]);
}

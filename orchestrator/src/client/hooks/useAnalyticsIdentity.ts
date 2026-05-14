import * as api from "@client/api";
import { useEffect } from "react";
import { identifyAnalyticsUser } from "@/lib/analytics";

export function useAnalyticsIdentity(): void {
  const hasSession = api.hasAuthenticatedSession();

  useEffect(() => {
    let cancelled = false;

    if (hasSession) {
      void api
        .getCurrentAuthUser()
        .then((user) => {
          if (cancelled) return;
          identifyAnalyticsUser(user.id);
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

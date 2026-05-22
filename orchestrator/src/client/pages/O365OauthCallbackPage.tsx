import type React from "react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export const O365OauthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: "o365-oauth-result",
          code,
          state,
          error,
        },
        window.location.origin,
      );
    }

    window.close();
  }, [searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Completing O365 connection…</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You can close this window if it does not close automatically.
        </p>
      </div>
    </main>
  );
};

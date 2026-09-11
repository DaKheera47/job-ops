import { completeSsoLink, completeSsoLogin } from "@client/api";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trackProductEvent } from "@/lib/analytics";
import { resolveNextPath } from "../lib/auth-navigation";
import { rememberAuthUser } from "../lib/remembered-auth-users";
import { consumePendingSsoFlow } from "../lib/sso-flow";

const INVALID_FLOW_MESSAGE = "This sign-in link is no longer valid.";
const PROVIDER_REFUSED_MESSAGE =
  "Your identity provider refused the sign-in. Try again, or ask your administrator to check the provider configuration.";

let capturedCallbackSearch = "";

/**
 * The identity provider hands the authorization code back in the query string
 * and index.html loads analytics beacons that read the URL, so the code has to
 * leave the address bar before anything else runs. The snapshot lives outside
 * React state because StrictMode renders this twice and the second pass would
 * otherwise see an already-stripped URL.
 */
function takeCallbackSearch(): string {
  if (typeof window === "undefined") return "";
  const { pathname, search } = window.location;
  if (search) {
    capturedCallbackSearch = search;
    window.history.replaceState(null, "", pathname);
  }
  return capturedCallbackSearch;
}

export const SsoCallbackPage: React.FC = () => {
  const [callbackSearch] = useState(takeCallbackSearch);
  const { provider } = useParams<{ provider: string }>();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const exchangeStarted = useRef(false);

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    const params = new URLSearchParams(callbackSearch);
    // Anyone can link to this page with error parameters, so the provider's own
    // text never reaches the DOM and the pending flow survives an unsolicited
    // visit.
    if (params.has("error") || params.has("error_description")) {
      setErrorMessage(PROVIDER_REFUSED_MESSAGE);
      return;
    }

    const flow = consumePendingSsoFlow();
    if (
      !flow ||
      flow.provider !== provider ||
      flow.state !== params.get("state")
    ) {
      setErrorMessage(INVALID_FLOW_MESSAGE);
      return;
    }

    const body = {
      state: flow.state,
      flowToken: flow.flowToken,
      callbackSearch,
    };

    void (async () => {
      try {
        if (flow.mode === "link") {
          await completeSsoLink(flow.provider, body);
          trackProductEvent("sso_link_completed", { provider: flow.provider });
          toast.success("Connected account added.");
          navigate("/settings#environment", { replace: true });
          return;
        }

        const result = await completeSsoLogin(flow.provider, body);
        rememberAuthUser({
          username: result.user.username,
          displayName: result.user.displayName,
        });
        trackProductEvent("sso_login_completed", {
          provider: flow.provider,
          created: result.created,
        });
        navigate(resolveNextPath(flow.next), { replace: true });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to finish single sign-on.",
        );
      }
    })();
  }, [callbackSearch, navigate, provider]);

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
        <Card className="w-full border-border/60 bg-background/95 shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl tracking-tight">
              {errorMessage ? "Sign-in failed" : "Finishing sign-in…"}
            </CardTitle>
            <CardDescription>
              {errorMessage
                ? "JobOps could not finish the handover from your identity provider."
                : "Completing the handover from your identity provider."}
            </CardDescription>
          </CardHeader>
          {errorMessage ? (
            <CardContent>
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
              <Button asChild className="mt-4 w-full" variant="outline">
                <Link to="/sign-in">Back to sign in</Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </main>
  );
};

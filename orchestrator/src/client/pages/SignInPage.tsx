import {
  hasAuthenticatedSession,
  restoreAuthSessionFromLegacyCredentials,
  signInWithCredentials,
} from "@client/api";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function resolveNextPath(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith("/")) return "/jobs/ready";
  if (rawNext === "/sign-in" || rawNext.startsWith("/sign-in?")) {
    return "/jobs/ready";
  }
  return rawNext;
}

export function SignInPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return resolveNextPath(params.get("next"));
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const restored = await restoreAuthSessionFromLegacyCredentials();
        if (cancelled) return;
        if (restored || hasAuthenticatedSession()) {
          navigate(nextPath, { replace: true });
          return;
        }
      } finally {
        if (!cancelled) {
          setIsBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, nextPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setErrorMessage("Enter both username and password.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await signInWithCredentials(normalizedUsername, password);
      navigate(nextPath, { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in",
      );
      setIsBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(120,119,198,0.08),_transparent_45%),linear-gradient(180deg,_rgba(15,23,42,0.02),_transparent_30%)] px-4 py-16">
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
        <Card className="w-full border-border/60 bg-background/95 shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl tracking-tight">Sign in</CardTitle>
            <CardDescription>
              Enter the application credentials configured for this JobOps
              instance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="auth-username">
                  Username
                </label>
                <Input
                  id="auth-username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.currentTarget.value)}
                  placeholder="Enter username"
                  disabled={isBusy}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="auth-password">
                  Password
                </label>
                <Input
                  id="auth-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  placeholder="Enter password"
                  disabled={isBusy}
                />
              </div>
              {errorMessage ? (
                <p className="text-sm text-destructive" role="alert">
                  {errorMessage}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={isBusy}>
                {isBusy ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

import {
  getAppStatus,
  getAuthBootstrapStatus,
  getSsoProviders,
  hasAuthenticatedSession,
  restoreAuthSessionFromLegacyCredentials,
  signInWithCredentials,
  signupWithCredentials,
  startSsoLogin,
} from "@client/api";
import type { SsoProviderInfo } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveNextPath } from "../lib/auth-navigation";
import { queryKeys } from "../lib/queryKeys";
import {
  loadRememberedAuthUsers,
  rememberAuthUser,
} from "../lib/remembered-auth-users";
import { rememberPendingSsoFlow } from "../lib/sso-flow";
import { SSO_PROVIDER_ICONS } from "../lib/sso-providers";

type AuthMode = "sign-in" | "signup";

export function SignInPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [hostedSignupEnabled, setHostedSignupEnabled] = useState(false);
  const [isBusy, setIsBusy] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rememberedUsers, setRememberedUsers] = useState(() =>
    loadRememberedAuthUsers(),
  );
  const ssoProvidersQuery = useQuery({
    queryKey: queryKeys.auth.ssoProviders(),
    queryFn: getSsoProviders,
    retry: false,
  });
  const ssoProviders = ssoProvidersQuery.data ?? [];

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return resolveNextPath(params.get("next"));
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rememberedUsername = params.get("user")?.trim();
    if (rememberedUsername) {
      setUsername(rememberedUsername);
      setPassword("");
    }
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const appStatus = await getAppStatus();
        if (cancelled) return;
        const canSignup =
          appStatus.appMode === "hosted" &&
          appStatus.capabilities.hostedSignups;
        setHostedSignupEnabled(canSignup);

        const bootstrap = await getAuthBootstrapStatus();
        if (cancelled) return;
        if (bootstrap.setupRequired) {
          navigate("/onboarding", { replace: true });
          return;
        }

        const restored = await restoreAuthSessionFromLegacyCredentials();
        if (cancelled) return;
        if (restored || hasAuthenticatedSession()) {
          navigate(nextPath, { replace: true });
          return;
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load sign-in status.",
          );
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
    if (authMode === "signup" && password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      if (authMode === "signup") {
        const user = await signupWithCredentials({
          username: normalizedUsername,
          password,
          displayName: displayName.trim() || normalizedUsername,
        });
        setRememberedUsers(
          rememberAuthUser({
            username: user.username,
            displayName: user.displayName,
          }),
        );
      } else {
        await signInWithCredentials(normalizedUsername, password);
        setRememberedUsers(
          rememberAuthUser({
            username: normalizedUsername,
          }),
        );
      }
      navigate(nextPath, { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in",
      );
      setIsBusy(false);
    }
  };

  const handleSsoSignIn = async (provider: SsoProviderInfo) => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const start = await startSsoLogin(provider.id);
      rememberPendingSsoFlow({
        provider: start.provider,
        state: start.state,
        flowToken: start.flowToken,
        mode: "login",
        next: nextPath,
      });
      window.location.assign(start.authorizationUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : `Unable to continue with ${provider.displayName}`,
      );
      setIsBusy(false);
    }
  };

  const resetFormFeedback = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setErrorMessage(null);
    setPassword("");
  };

  const title = authMode === "signup" ? "Create account" : "Sign in";
  const description =
    authMode === "signup"
      ? "Create your JobOps account for this hosted workspace."
      : "Enter your JobOps username and password.";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(120,119,198,0.08),_transparent_45%),linear-gradient(180deg,_rgba(15,23,42,0.02),_transparent_30%)] px-4 py-16">
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
        <Card className="w-full border-border/60 bg-background/95 shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            {hostedSignupEnabled ? (
              <Tabs
                value={authMode}
                onValueChange={(value) => resetFormFeedback(value as AuthMode)}
                className="mb-5"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger
                    value="sign-in"
                    onClick={() => resetFormFeedback("sign-in")}
                  >
                    Sign in
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    onClick={() => resetFormFeedback("signup")}
                  >
                    Create account
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
            {authMode === "sign-in" && rememberedUsers.length > 0 ? (
              <div className="mb-5 space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Remembered on this browser
                </div>
                <div className="flex flex-wrap gap-2">
                  {rememberedUsers.map((user) => (
                    <Button
                      key={user.username}
                      type="button"
                      variant={
                        username.trim() === user.username
                          ? "secondary"
                          : "outline"
                      }
                      size="sm"
                      className="h-8 max-w-full px-2.5"
                      disabled={isBusy}
                      onClick={() => {
                        setUsername(user.username);
                        setPassword("");
                        setErrorMessage(null);
                      }}
                    >
                      <span className="truncate">
                        {user.displayName ?? user.username}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <form className="space-y-4" onSubmit={handleSubmit}>
              {authMode === "signup" ? (
                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="auth-display-name"
                  >
                    Name
                  </label>
                  <Input
                    id="auth-display-name"
                    autoComplete="name"
                    value={displayName}
                    onChange={(event) =>
                      setDisplayName(event.currentTarget.value)
                    }
                    placeholder="Your name"
                    disabled={isBusy}
                  />
                </div>
              ) : null}
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
                  autoComplete={
                    authMode === "signup" ? "new-password" : "current-password"
                  }
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
                {isBusy
                  ? authMode === "signup"
                    ? "Creating account..."
                    : "Signing in..."
                  : authMode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </Button>
            </form>
            {ssoProviders.length > 0 ? (
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    or continue with
                  </span>
                  <Separator className="flex-1" />
                </div>
                {ssoProviders.map((provider) => {
                  const ProviderIcon = SSO_PROVIDER_ICONS[provider.id];
                  return (
                    <Button
                      key={provider.id}
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={isBusy}
                      onClick={() => void handleSsoSignIn(provider)}
                    >
                      <ProviderIcon className="mr-2 h-4 w-4" />
                      Continue with {provider.displayName}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

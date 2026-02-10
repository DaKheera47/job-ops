import {
  type BasicAuthCredentials,
  type BasicAuthPromptRequest,
  setBasicAuthPromptHandler,
} from "@client/api/client";
import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PendingPrompt = {
  request: BasicAuthPromptRequest;
  resolve: (credentials: BasicAuthCredentials | null) => void;
};

export const BasicAuthPrompt: React.FC = () => {
  const [pendingRequest, setPendingRequest] =
    React.useState<PendingPrompt | null>(null);
  const pendingRequestRef = React.useRef<PendingPrompt | null>(null);
  const usernameInputRef = React.useRef<HTMLInputElement>(null);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const resolvePrompt = React.useCallback(
    (credentials: BasicAuthCredentials | null) => {
      const activePrompt = pendingRequestRef.current;
      pendingRequestRef.current = null;
      setPendingRequest(null);
      setUsername("");
      setPassword("");
      setErrorMessage(null);
      activePrompt?.resolve(credentials);
    },
    [],
  );

  React.useEffect(() => {
    setBasicAuthPromptHandler((request) => {
      return new Promise<BasicAuthCredentials | null>((resolve) => {
        if (pendingRequestRef.current) {
          pendingRequestRef.current.resolve(null);
        }
        const nextPrompt = { request, resolve };
        pendingRequestRef.current = nextPrompt;
        setPendingRequest(nextPrompt);
      });
    });

    return () => {
      setBasicAuthPromptHandler(null);
      if (pendingRequestRef.current) {
        pendingRequestRef.current.resolve(null);
        pendingRequestRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!pendingRequest) return;
    setUsername(pendingRequest.request.usernameHint ?? "");
    setPassword("");
    setErrorMessage(pendingRequest.request.errorMessage ?? null);
    const timeout = window.setTimeout(() => {
      usernameInputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [pendingRequest]);

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalizedUsername = username.trim();
      if (!normalizedUsername || !password) {
        setErrorMessage("Enter both username and password.");
        return;
      }
      resolvePrompt({ username: normalizedUsername, password });
    },
    [password, resolvePrompt, username],
  );

  const request = pendingRequest?.request;

  return (
    <AlertDialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) resolvePrompt(null);
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Authentication required</AlertDialogTitle>
          <AlertDialogDescription>
            You are required to authenticate to access this application.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor="basic-auth-username"
            >
              Username
            </label>
            <Input
              ref={usernameInputRef}
              id="basic-auth-username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              htmlFor="basic-auth-password"
            >
              Password
            </label>
            <Input
              id="basic-auth-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </div>
          {errorMessage && (
            <p className="text-sm text-red-600" role="alert">
              {errorMessage}
            </p>
          )}
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => resolvePrompt(null)}
            >
              Cancel
            </Button>
            <Button type="submit">Continue</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};

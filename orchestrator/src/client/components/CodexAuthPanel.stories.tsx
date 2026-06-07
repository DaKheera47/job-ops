import type { CodexAuthStatusResponse } from "@client/api";
import type { Story } from "@ladle/react";
import type React from "react";
import { CodexAuthPanel } from "./CodexAuthPanel";

type CodexAuthApi = React.ComponentProps<typeof CodexAuthPanel>["authApi"];

const verificationUrl = "https://auth.openai.com/codex/device";

const makeStatus = (
  overrides: Partial<CodexAuthStatusResponse> = {},
): CodexAuthStatusResponse => ({
  authenticated: false,
  username: null,
  validationMessage:
    "Codex is not authenticated in this container. Run `codex login` and try again.",
  flowStatus: "idle",
  loginInProgress: false,
  verificationUrl: null,
  userCode: null,
  startedAt: null,
  expiresAt: null,
  flowMessage: null,
  ...overrides,
});

const idleStatus = makeStatus();
const waitingStatus = makeStatus({
  validationMessage: null,
  flowStatus: "running",
  loginInProgress: true,
  verificationUrl,
  userCode: "ABCD-EFGH",
  startedAt: new Date(Date.now() - 45_000).toISOString(),
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  flowMessage:
    "Open the verification URL and enter the one-time code to finish login.",
});
const expiringStatus = makeStatus({
  ...waitingStatus,
  expiresAt: new Date(Date.now() + 75_000).toISOString(),
});
const completedButUnauthenticatedStatus = makeStatus({
  flowStatus: "completed",
  verificationUrl,
  userCode: "ABCD-EFGH",
  startedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 8 * 60_000).toISOString(),
  flowMessage: "Codex login completed.",
});
const authenticatedStatus = makeStatus({
  authenticated: true,
  username: "sadia@example.com",
  validationMessage: null,
  flowStatus: "completed",
  flowMessage: "Codex login completed.",
});

function createAuthApi(
  initialStatus: CodexAuthStatusResponse,
  options: {
    disconnectStatus?: CodexAuthStatusResponse;
    startStatus?: CodexAuthStatusResponse;
    startError?: Error;
  } = {},
): CodexAuthApi {
  let currentStatus = initialStatus;
  return {
    disconnect: async () => {
      currentStatus = options.disconnectStatus ?? idleStatus;
      return currentStatus;
    },
    getStatus: async () => currentStatus,
    start: async () => {
      if (options.startError) throw options.startError;
      currentStatus = options.startStatus ?? waitingStatus;
      return currentStatus;
    },
  };
}

const PanelFrame: React.FC<{
  children: React.ReactNode;
  label: string;
}> = ({ children, label }) => (
  <section className="w-full max-w-[584px] space-y-2">
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    {children}
  </section>
);

const StoryShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="min-h-[420px] bg-background p-6 text-foreground">
    {children}
  </main>
);

function renderPanel(
  label: string,
  status: CodexAuthStatusResponse,
  options: {
    authApi?: CodexAuthApi;
    isBusy?: boolean;
  } = {},
) {
  return (
    <PanelFrame label={label}>
      <CodexAuthPanel
        authApi={options.authApi ?? createAuthApi(status)}
        isBusy={options.isBusy ?? false}
      />
    </PanelFrame>
  );
}

export const Idle: Story = () => (
  <StoryShell>{renderPanel("Idle / not authenticated", idleStatus)}</StoryShell>
);
Idle.storyName = "Idle";

export const WaitingForApproval: Story = () => (
  <StoryShell>
    {renderPanel("Waiting for browser approval", waitingStatus)}
  </StoryShell>
);
WaitingForApproval.storyName = "Waiting for approval";

export const ExpiringSoon: Story = () => (
  <StoryShell>
    {renderPanel("Device code expiring soon", expiringStatus)}
  </StoryShell>
);
ExpiringSoon.storyName = "Expiring soon";

export const CompletedButNotAuthenticated: Story = () => (
  <StoryShell>
    {renderPanel(
      "Completed flow, validation still failing",
      completedButUnauthenticatedStatus,
    )}
  </StoryShell>
);
CompletedButNotAuthenticated.storyName = "Completed but not authenticated";

export const Authenticated: Story = () => (
  <StoryShell>
    {renderPanel("Authenticated", authenticatedStatus, {
      authApi: createAuthApi(authenticatedStatus, {
        disconnectStatus: idleStatus,
      }),
    })}
  </StoryShell>
);
Authenticated.storyName = "Authenticated";

export const BusyDisabled: Story = () => (
  <StoryShell>
    {renderPanel("Parent form busy", waitingStatus, { isBusy: true })}
  </StoryShell>
);
BusyDisabled.storyName = "Busy / disabled";

export const StartFailure: Story = () => (
  <StoryShell>
    {renderPanel("Start sign-in failure", idleStatus, {
      authApi: createAuthApi(idleStatus, {
        startError: new Error("Codex CLI is not installed in this runtime."),
      }),
    })}
  </StoryShell>
);
StartFailure.storyName = "Start failure";

export const AllStates: Story = () => (
  <StoryShell>
    <div className="grid gap-6 xl:grid-cols-2">
      {renderPanel("Idle / not authenticated", idleStatus)}
      {renderPanel("Waiting for browser approval", waitingStatus)}
      {renderPanel("Device code expiring soon", expiringStatus)}
      {renderPanel(
        "Completed flow, validation still failing",
        completedButUnauthenticatedStatus,
      )}
      {renderPanel("Authenticated", authenticatedStatus, {
        authApi: createAuthApi(authenticatedStatus, {
          disconnectStatus: idleStatus,
        }),
      })}
      {renderPanel("Parent form busy", waitingStatus, { isBusy: true })}
    </div>
  </StoryShell>
);
AllStates.storyName = "All states";

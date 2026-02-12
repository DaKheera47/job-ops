import type {
  JobListItem,
  PostApplicationInboxItem,
  PostApplicationProvider,
  PostApplicationSyncRun,
} from "@shared/types";
import { POST_APPLICATION_PROVIDERS } from "@shared/types";
import {
  Inbox,
  Link2,
  Loader2,
  RefreshCcw,
  Unplug,
  Upload,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import * as api from "../api";
import { EmptyState, PageHeader, PageMain } from "../components";
import { EmailViewerList } from "./tracking-inbox/EmailViewerList";

const PROVIDER_OPTIONS: PostApplicationProvider[] = [
  ...POST_APPLICATION_PROVIDERS,
];
const GMAIL_OAUTH_RESULT_TYPE = "gmail-oauth-result";
const GMAIL_OAUTH_TIMEOUT_MS = 3 * 60 * 1000;

type GmailOauthResultMessage = {
  type: string;
  state?: string;
  code?: string;
  error?: string;
};

function getFirstCandidateId(item: PostApplicationInboxItem): string {
  if (item.message.matchedJobId) {
    const matched = item.candidates.find(
      (candidate) => candidate.jobId === item.message.matchedJobId,
    );
    if (matched) return matched.id;
  }
  return item.candidates[0]?.id ?? "";
}

function formatEpochMs(value?: number | null): string {
  if (!value) return "n/a";
  return formatDateTime(new Date(value).toISOString()) ?? "n/a";
}

export const TrackingInboxPage: React.FC = () => {
  const [provider, setProvider] = useState<PostApplicationProvider>("gmail");
  const [accountKey, setAccountKey] = useState("default");
  const [maxMessages, setMaxMessages] = useState("100");
  const [searchDays, setSearchDays] = useState("90");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<
    "connect" | "sync" | "disconnect" | null
  >(null);

  const [status, setStatus] = useState<
    | Awaited<ReturnType<typeof api.postApplicationProviderStatus>>["status"]
    | null
  >(null);
  const [inbox, setInbox] = useState<PostApplicationInboxItem[]>([]);
  const [runs, setRuns] = useState<PostApplicationSyncRun[]>([]);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [isRunMessagesLoading, setIsRunMessagesLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PostApplicationSyncRun | null>(
    null,
  );
  const [selectedRunItems, setSelectedRunItems] = useState<
    PostApplicationInboxItem[]
  >([]);

  const [candidateByMessageId, setCandidateByMessageId] = useState<
    Record<string, string>
  >({});
  const [appliedJobByMessageId, setAppliedJobByMessageId] = useState<
    Record<string, string>
  >({});
  const [appliedJobs, setAppliedJobs] = useState<JobListItem[]>([]);
  const [isAppliedJobsLoading, setIsAppliedJobsLoading] = useState(false);
  const [hasAttemptedAppliedJobsLoad, setHasAttemptedAppliedJobsLoad] =
    useState(false);

  const primeCandidateSelections = useCallback(
    (items: PostApplicationInboxItem[]) => {
      setCandidateByMessageId((previous) => {
        const next = { ...previous };
        for (const item of items) {
          const selectedCandidateId = next[item.message.id];
          const hasValidSelection = item.candidates.some(
            (candidate) => candidate.id === selectedCandidateId,
          );
          if (!selectedCandidateId || !hasValidSelection) {
            next[item.message.id] = getFirstCandidateId(item);
          }
        }
        return next;
      });
    },
    [],
  );

  const loadAppliedJobs = useCallback(async () => {
    if (hasAttemptedAppliedJobsLoad || isAppliedJobsLoading) return;
    setHasAttemptedAppliedJobsLoad(true);
    setIsAppliedJobsLoading(true);
    try {
      const response = await api.getJobs({
        view: "list",
      });
      setAppliedJobs(response.jobs);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load jobs";
      toast.error(message);
    } finally {
      setIsAppliedJobsLoading(false);
    }
  }, [hasAttemptedAppliedJobsLoad, isAppliedJobsLoading]);

  const loadAll = useCallback(async () => {
    const [statusRes, inboxRes, runsRes] = await Promise.all([
      api.postApplicationProviderStatus({ provider, accountKey }),
      api.getPostApplicationInbox({ provider, accountKey, limit: 100 }),
      api.getPostApplicationRuns({ provider, accountKey, limit: 20 }),
    ]);

    setStatus(statusRes.status);
    setInbox(inboxRes.items);
    setRuns(runsRes.runs);
    primeCandidateSelections(inboxRes.items);
  }, [provider, accountKey, primeCandidateSelections]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadAll();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to refresh tracking inbox";
      toast.error(message);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [loadAll]);

  useEffect(() => {
    setIsLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!provider || !accountKey) return;
    setAppliedJobs([]);
    setAppliedJobByMessageId({});
    setHasAttemptedAppliedJobsLoad(false);
  }, [provider, accountKey]);

  const hasReviewItems = useMemo(
    () => inbox.length > 0 || selectedRunItems.length > 0,
    [inbox.length, selectedRunItems.length],
  );

  useEffect(() => {
    if (!hasReviewItems) return;
    void loadAppliedJobs();
  }, [hasReviewItems, loadAppliedJobs]);

  useEffect(() => {
    const itemsWithoutCandidates = [...inbox, ...selectedRunItems].filter(
      (item) => item.candidates.length === 0,
    );
    if (itemsWithoutCandidates.length === 0) return;

    const defaultAppliedJobId = appliedJobs[0]?.id ?? "";
    setAppliedJobByMessageId((previous) => {
      const next = { ...previous };
      for (const item of itemsWithoutCandidates) {
        const selectedJobId = next[item.message.id];
        const hasValidSelection = appliedJobs.some(
          (appliedJob) => appliedJob.id === selectedJobId,
        );
        if (!selectedJobId || !hasValidSelection) {
          next[item.message.id] = defaultAppliedJobId;
        }
      }
      return next;
    });
  }, [appliedJobs, inbox, selectedRunItems]);

  const waitForGmailOauthResult = useCallback(
    (
      expectedState: string,
      popup: Window,
    ): Promise<{ code?: string; error?: string }> => {
      return new Promise((resolve, reject) => {
        let settled = false;

        const close = () => {
          window.clearTimeout(timeoutId);
          window.clearInterval(closedCheckId);
          window.removeEventListener("message", onMessage);
        };

        const finishResolve = (value: { code?: string; error?: string }) => {
          if (settled) return;
          settled = true;
          close();
          try {
            popup.close();
          } catch {
            // Ignore cross-window close errors.
          }
          resolve(value);
        };

        const finishReject = (message: string) => {
          if (settled) return;
          settled = true;
          close();
          reject(new Error(message));
        };

        const onMessage = (event: MessageEvent<unknown>) => {
          if (event.origin !== window.location.origin) return;
          const data = event.data as GmailOauthResultMessage | undefined;
          if (!data || data.type !== GMAIL_OAUTH_RESULT_TYPE) return;
          if (data.state !== expectedState) return;
          finishResolve({
            ...(data.code ? { code: data.code } : {}),
            ...(data.error ? { error: data.error } : {}),
          });
        };

        const timeoutId = window.setTimeout(() => {
          finishReject("Timed out waiting for Gmail OAuth response.");
        }, GMAIL_OAUTH_TIMEOUT_MS);

        const closedCheckId = window.setInterval(() => {
          if (!popup.closed) return;
          finishReject("Gmail OAuth window was closed before completion.");
        }, 250);

        window.addEventListener("message", onMessage);
      });
    },
    [],
  );

  const runProviderAction = useCallback(
    async (action: "connect" | "sync" | "disconnect") => {
      setIsActionLoading(true);
      setActiveAction(action);
      let syncToastId: string | number | null = null;
      try {
        if (action === "connect") {
          if (provider !== "gmail") {
            toast.error(
              `${provider} connect is not implemented yet. Use Gmail for now.`,
            );
            return;
          }

          const oauthStart = await api.postApplicationGmailOauthStart({
            accountKey,
          });
          const popup = window.open(
            oauthStart.authorizationUrl,
            "gmail-oauth-connect",
            "popup,width=520,height=720",
          );
          if (!popup) {
            toast.error(
              "Browser blocked the Gmail OAuth popup. Allow popups and retry.",
            );
            return;
          }

          const oauthResult = await waitForGmailOauthResult(
            oauthStart.state,
            popup,
          );
          if (oauthResult.error) {
            throw new Error(`Gmail OAuth failed: ${oauthResult.error}`);
          }
          if (!oauthResult.code) {
            throw new Error(
              "Gmail OAuth did not return an authorization code.",
            );
          }

          await api.postApplicationGmailOauthExchange({
            accountKey,
            state: oauthStart.state,
            code: oauthResult.code,
          });
          toast.success("Provider connected");
        } else if (action === "sync") {
          const parsedMaxMessages = Number.parseInt(maxMessages, 10);
          const parsedSearchDays = Number.parseInt(searchDays, 10);
          if (
            !Number.isFinite(parsedMaxMessages) ||
            parsedMaxMessages < 1 ||
            parsedMaxMessages > 500 ||
            !Number.isFinite(parsedSearchDays) ||
            parsedSearchDays < 1 ||
            parsedSearchDays > 365
          ) {
            toast.error(
              "Max messages must be 1-500 and search days must be 1-365 before syncing.",
            );
            return;
          }
          syncToastId = toast.loading(
            "Sync in progress. This may take up to a couple of minutes.",
          );

          await api.postApplicationProviderSync({
            provider,
            accountKey,
            maxMessages: parsedMaxMessages,
            searchDays: parsedSearchDays,
          });
          toast.success("Sync completed", {
            ...(syncToastId ? { id: syncToastId } : {}),
          });
        } else {
          await api.postApplicationProviderDisconnect({ provider, accountKey });
          toast.success("Provider disconnected");
        }

        await refresh();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Failed to ${action} provider connection`;
        if (syncToastId) {
          toast.error(message, { id: syncToastId });
        } else {
          toast.error(message);
        }
      } finally {
        setActiveAction(null);
        setIsActionLoading(false);
      }
    },
    [
      accountKey,
      maxMessages,
      provider,
      refresh,
      searchDays,
      waitForGmailOauthResult,
    ],
  );

  const handleDecision = useCallback(
    async (item: PostApplicationInboxItem, decision: "approve" | "deny") => {
      const candidateId = candidateByMessageId[item.message.id] ?? "";
      const candidateJobId =
        item.candidates.find((candidate) => candidate.id === candidateId)
          ?.jobId ?? "";
      const selectedJobId =
        appliedJobByMessageId[item.message.id] ?? candidateJobId;

      if (!selectedJobId) {
        toast.error("Select an applied job before making a decision.");
        return;
      }

      setIsActionLoading(true);
      try {
        if (decision === "approve") {
          await api.approvePostApplicationInboxItem({
            messageId: item.message.id,
            provider,
            accountKey,
            jobId: selectedJobId,
          });
          toast.success("Message approved");
        } else {
          await api.denyPostApplicationInboxItem({
            messageId: item.message.id,
            provider,
            accountKey,
            jobId: selectedJobId,
          });
          toast.success("Message denied");
        }

        await refresh();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `Failed to ${decision} message`;
        toast.error(message);
      } finally {
        setIsActionLoading(false);
      }
    },
    [
      accountKey,
      appliedJobByMessageId,
      candidateByMessageId,
      provider,
      refresh,
    ],
  );

  const handleOpenRunMessages = useCallback(
    async (run: PostApplicationSyncRun) => {
      setSelectedRun(run);
      setSelectedRunItems([]);
      setIsRunModalOpen(true);
      setIsRunMessagesLoading(true);

      try {
        const response = await api.getPostApplicationRunMessages({
          runId: run.id,
          provider,
          accountKey,
        });
        setSelectedRun(response.run);
        setSelectedRunItems(response.items);
        primeCandidateSelections(response.items);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load messages for selected sync run";
        toast.error(message);
      } finally {
        setIsRunMessagesLoading(false);
      }
    },
    [accountKey, primeCandidateSelections, provider],
  );

  const pendingCount = inbox.length;
  const isConnected = Boolean(status?.connected);
  const connectionLabel = useMemo(() => {
    if (!status) return "Unknown";
    if (!status.connected) return "Disconnected";
    if (status.integration?.status === "error") return "Error";
    return "Connected";
  }, [status]);

  const handleAppliedJobChange = useCallback(
    (messageId: string, value: string) => {
      setAppliedJobByMessageId((previous) => ({
        ...previous,
        [messageId]: value,
      }));
    },
    [],
  );

  return (
    <>
      <PageHeader
        icon={Inbox}
        title="Tracking Inbox"
        subtitle="Post-application message review"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refresh()}
            disabled={isRefreshing || isLoading}
            className="gap-2"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      />

      <PageMain className="space-y-4">
        <section className="space-y-1 px-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">
              Application Inbox Matching
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Connect your inbox to ingest related emails, review the suggested
            job matches, and approve or deny to automatically update your
            tracking timeline.
          </p>
        </section>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Provider Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <Select
                  value={provider}
                  onValueChange={(value) =>
                    setProvider(value as PostApplicationProvider)
                  }
                >
                  <SelectTrigger id="provider">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountKey">Account Key</Label>
                <Input
                  id="accountKey"
                  value={accountKey}
                  onChange={(event) => setAccountKey(event.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Gmail connect uses Google OAuth popup and stores credentials
              server-side. No manual refresh token paste is needed.
            </p>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="maxMessages">Max Messages</Label>
                <Input
                  id="maxMessages"
                  inputMode="numeric"
                  value={maxMessages}
                  onChange={(event) => setMaxMessages(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="searchDays">Search Days</Label>
                <Input
                  id="searchDays"
                  inputMode="numeric"
                  value={searchDays}
                  onChange={(event) => setSearchDays(event.target.value)}
                />
              </div>
              <div className="md:col-span-2 flex flex-wrap items-end gap-2">
                {!isConnected ? (
                  <Button
                    onClick={() => void runProviderAction("connect")}
                    disabled={isActionLoading}
                    className="gap-2"
                  >
                    <Link2 className="h-4 w-4" />
                    Connect
                  </Button>
                ) : null}
                <Button
                  onClick={() => void runProviderAction("sync")}
                  disabled={isActionLoading || !isConnected}
                  variant="secondary"
                  className="gap-2"
                >
                  {activeAction === "sync" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {activeAction === "sync" ? "Syncing..." : "Sync"}
                </Button>
                {isConnected ? (
                  <Button
                    onClick={() => void runProviderAction("disconnect")}
                    disabled={isActionLoading}
                    variant="outline"
                    className="gap-2"
                  >
                    <Unplug className="h-4 w-4" />
                    Disconnect
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={status?.connected ? "default" : "outline"}>
                {connectionLabel}
              </Badge>
              <span className="text-muted-foreground">
                Pending review:{" "}
                <span className="font-semibold">{pendingCount}</span>
              </span>
              {status?.integration?.lastSyncedAt ? (
                <span className="text-muted-foreground">
                  Last synced: {formatEpochMs(status.integration.lastSyncedAt)}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pending Review Queue</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading inbox...
              </div>
            ) : inbox.length === 0 ? (
              <EmptyState
                title="No pending messages"
                description="Run sync to ingest new job-application emails."
              />
            ) : (
              <EmailViewerList
                items={inbox}
                appliedJobs={appliedJobs}
                candidateByMessageId={candidateByMessageId}
                appliedJobByMessageId={appliedJobByMessageId}
                onAppliedJobChange={handleAppliedJobChange}
                onDecision={(item, decision) =>
                  void handleDecision(item, decision)
                }
                isActionLoading={isActionLoading}
                isAppliedJobsLoading={isAppliedJobsLoading}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Sync Runs</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sync runs yet.</p>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className="w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/30"
                    onClick={() => void handleOpenRunMessages(run)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        <p>{run.id}</p>
                        <p>{formatEpochMs(run.startedAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline">{run.status}</Badge>
                        <span className="text-muted-foreground">
                          discovered {run.messagesDiscovered}
                        </span>
                        <span className="text-muted-foreground">
                          relevant {run.messagesRelevant}
                        </span>
                        <span className="text-muted-foreground">
                          matched {run.messagesMatched}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageMain>

      <Dialog
        open={isRunModalOpen}
        onOpenChange={(open) => {
          setIsRunModalOpen(open);
          if (!open) {
            setSelectedRunItems([]);
            setSelectedRun(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-6xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Run Messages</DialogTitle>
            <DialogDescription>
              {selectedRun
                ? `Run ${selectedRun.id} • discovered ${selectedRun.messagesDiscovered} • relevant ${selectedRun.messagesRelevant} • matched ${selectedRun.messagesMatched}`
                : "Review all messages captured in this sync run, including partial matches."}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(85vh-92px)] overflow-auto px-6 pb-6">
            {isRunMessagesLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading run messages...
              </div>
            ) : selectedRunItems.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No messages found for this run.
              </p>
            ) : (
              <EmailViewerList
                items={selectedRunItems}
                appliedJobs={appliedJobs}
                candidateByMessageId={candidateByMessageId}
                appliedJobByMessageId={appliedJobByMessageId}
                onAppliedJobChange={handleAppliedJobChange}
                onDecision={(item, decision) =>
                  void handleDecision(item, decision)
                }
                isActionLoading={isActionLoading}
                isAppliedJobsLoading={isAppliedJobsLoading}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

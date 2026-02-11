import type {
  PostApplicationInboxItem,
  PostApplicationProvider,
  PostApplicationSyncRun,
} from "@shared/types";
import {
  CheckCircle2,
  Inbox,
  Link2,
  Loader2,
  RefreshCcw,
  Unplug,
  Upload,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import * as api from "../api";
import { EmptyState, PageHeader, PageMain } from "../components";

const PROVIDER_OPTIONS: PostApplicationProvider[] = ["gmail", "imap"];

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
  const [refreshToken, setRefreshToken] = useState("");
  const [maxMessages, setMaxMessages] = useState("100");
  const [searchDays, setSearchDays] = useState("90");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const [status, setStatus] = useState<
    | Awaited<ReturnType<typeof api.postApplicationProviderStatus>>["status"]
    | null
  >(null);
  const [inbox, setInbox] = useState<PostApplicationInboxItem[]>([]);
  const [runs, setRuns] = useState<PostApplicationSyncRun[]>([]);

  const [candidateByMessageId, setCandidateByMessageId] = useState<
    Record<string, string>
  >({});
  const [noteByMessageId, setNoteByMessageId] = useState<
    Record<string, string>
  >({});

  const loadAll = useCallback(async () => {
    const [statusRes, inboxRes, runsRes] = await Promise.all([
      api.postApplicationProviderStatus({ provider, accountKey }),
      api.getPostApplicationInbox({ provider, accountKey, limit: 100 }),
      api.getPostApplicationRuns({ provider, accountKey, limit: 20 }),
    ]);

    setStatus(statusRes.status);
    setInbox(inboxRes.items);
    setRuns(runsRes.runs);

    setCandidateByMessageId((previous) => {
      const next = { ...previous };
      for (const item of inboxRes.items) {
        if (!next[item.message.id]) {
          next[item.message.id] = getFirstCandidateId(item);
        }
      }
      return next;
    });
  }, [provider, accountKey]);

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

  const runProviderAction = useCallback(
    async (action: "connect" | "sync" | "disconnect") => {
      setIsActionLoading(true);
      try {
        if (action === "connect") {
          if (!refreshToken.trim()) {
            toast.error("Refresh token is required to connect Gmail.");
            return;
          }

          await api.postApplicationProviderConnect({
            provider,
            accountKey,
            payload: {
              refreshToken: refreshToken.trim(),
            },
          });
          toast.success("Provider connected");
        } else if (action === "sync") {
          await api.postApplicationProviderSync({
            provider,
            accountKey,
            maxMessages: Number(maxMessages),
            searchDays: Number(searchDays),
          });
          toast.success("Sync started");
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
        toast.error(message);
      } finally {
        setIsActionLoading(false);
      }
    },
    [accountKey, maxMessages, provider, refresh, refreshToken, searchDays],
  );

  const handleDecision = useCallback(
    async (item: PostApplicationInboxItem, decision: "approve" | "deny") => {
      const candidateId = candidateByMessageId[item.message.id] ?? "";
      const note = noteByMessageId[item.message.id]?.trim();

      if (!candidateId) {
        toast.error("Select a candidate before making a decision.");
        return;
      }

      setIsActionLoading(true);
      try {
        if (decision === "approve") {
          await api.approvePostApplicationInboxItem({
            messageId: item.message.id,
            provider,
            accountKey,
            candidateId,
            ...(note ? { note } : {}),
          });
          toast.success("Message approved");
        } else {
          await api.denyPostApplicationInboxItem({
            messageId: item.message.id,
            provider,
            accountKey,
            candidateId,
            ...(note ? { note } : {}),
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
    [accountKey, candidateByMessageId, noteByMessageId, provider, refresh],
  );

  const pendingCount = inbox.length;
  const connectionLabel = useMemo(() => {
    if (!status) return "Unknown";
    if (!status.connected) return "Disconnected";
    if (status.integration?.status === "error") return "Error";
    return "Connected";
  }, [status]);

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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Provider Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
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

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="refreshToken">
                  Refresh Token (Gmail connect)
                </Label>
                <Input
                  id="refreshToken"
                  type="password"
                  value={refreshToken}
                  onChange={(event) => setRefreshToken(event.target.value)}
                  placeholder="Paste Gmail refresh token"
                />
              </div>
            </div>

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
                <Button
                  onClick={() => void runProviderAction("connect")}
                  disabled={isActionLoading}
                  className="gap-2"
                >
                  <Link2 className="h-4 w-4" />
                  Connect
                </Button>
                <Button
                  onClick={() => void runProviderAction("sync")}
                  disabled={isActionLoading}
                  variant="secondary"
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Sync
                </Button>
                <Button
                  onClick={() => void runProviderAction("disconnect")}
                  disabled={isActionLoading}
                  variant="outline"
                  className="gap-2"
                >
                  <Unplug className="h-4 w-4" />
                  Disconnect
                </Button>
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
              <div className="space-y-4">
                {inbox.map((item) => (
                  <div
                    key={item.message.id}
                    className="rounded-lg border p-3 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {item.message.subject}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.message.fromAddress} ·{" "}
                          {formatEpochMs(item.message.receivedAt)}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {item.message.classificationLabel ?? "Unknown"}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {item.message.snippet}
                    </p>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="md:col-span-2 space-y-2">
                        <Label>Candidate match</Label>
                        <Select
                          value={candidateByMessageId[item.message.id] ?? ""}
                          onValueChange={(value) =>
                            setCandidateByMessageId((previous) => ({
                              ...previous,
                              [item.message.id]: value,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select candidate" />
                          </SelectTrigger>
                          <SelectContent>
                            {item.candidates.map((candidate) => (
                              <SelectItem
                                key={candidate.id}
                                value={candidate.id}
                              >
                                {candidate.jobId} ·{" "}
                                {Math.round(candidate.score)}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Reviewer note</Label>
                        <Textarea
                          value={noteByMessageId[item.message.id] ?? ""}
                          onChange={(event) =>
                            setNoteByMessageId((previous) => ({
                              ...previous,
                              [item.message.id]: event.target.value,
                            }))
                          }
                          placeholder="Optional note"
                          rows={2}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleDecision(item, "approve")}
                        disabled={isActionLoading}
                        className="gap-1.5"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleDecision(item, "deny")}
                        disabled={isActionLoading}
                        className="gap-1.5"
                      >
                        <XCircle className="h-4 w-4" />
                        Deny
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
                  <div
                    key={run.id}
                    className="rounded-lg border px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                  >
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageMain>
    </>
  );
};

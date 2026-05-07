import type {
  PostApplicationJobEmailItem,
  PostApplicationProcessingStatus,
} from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import {
  CircleUserRound,
  ExternalLink,
  Inbox,
  Mail,
  MailWarning,
} from "lucide-react";
import React from "react";
import * as api from "@/client/api";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";

const JOB_EMAIL_LIMIT = 100;

type EmailFilter = "all" | "auto_linked" | "manual_linked" | "pending_user";

type JobEmailsPanelProps = {
  jobId: string;
};

const filterOptions: Array<{
  id: EmailFilter;
  label: string;
  matches: (status: PostApplicationProcessingStatus) => boolean;
}> = [
  {
    id: "all",
    label: "All",
    matches: () => true,
  },
  {
    id: "auto_linked",
    label: "Auto linked",
    matches: (status) => status === "auto_linked",
  },
  {
    id: "manual_linked",
    label: "Manual",
    matches: (status) => status === "manual_linked",
  },
  {
    id: "pending_user",
    label: "Needs review",
    matches: (status) => status === "pending_user",
  },
];

const statusLabel: Record<PostApplicationProcessingStatus, string> = {
  auto_linked: "Auto linked",
  pending_user: "Needs review",
  manual_linked: "Manual",
  ignored: "Ignored",
};

const statusClassName: Record<PostApplicationProcessingStatus, string> = {
  auto_linked: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  pending_user: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  manual_linked: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  ignored: "border-border/60 bg-muted/25 text-muted-foreground",
};

function formatEpochMs(value: number | null): string {
  if (!value) return "Unknown date";
  return formatDateTime(new Date(value).toISOString()) ?? "Unknown date";
}

function getSenderLabel(item: PostApplicationJobEmailItem): string {
  const senderName = item.message.senderName?.trim();
  if (senderName) return senderName;
  const address = item.message.fromAddress.trim();
  return address || "Unknown sender";
}

function formatConfidence(value: number | null): string {
  if (value === null) return "n/a";
  return `${Math.round(value)}%`;
}

function getAccountLabel(items: PostApplicationJobEmailItem[]): string | null {
  const labels = Array.from(
    new Set(
      items
        .map((item) => item.accountDisplayName?.trim())
        .filter((label): label is string => Boolean(label)),
    ),
  );
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0] ?? null;
  return `${labels.length} accounts`;
}

const EmptyState: React.FC<{
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}> = ({ title, description, icon: Icon = Inbox }) => (
  <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/20 p-6 text-center">
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
      <Icon className="h-4 w-4" />
    </div>
    <div className="mt-3 text-sm font-semibold">{title}</div>
    <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
      {description}
    </p>
  </div>
);

const EmailRow: React.FC<{ item: PostApplicationJobEmailItem }> = ({
  item,
}) => {
  const sender = getSenderLabel(item);
  const date = formatEpochMs(item.message.receivedAt);

  return (
    <article className="grid gap-3 border-b border-border/50 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/35 text-muted-foreground">
            <CircleUserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-sm font-semibold">{sender}</h3>
              <span className="text-xs text-muted-foreground">{date}</span>
            </div>
            <div className="mt-1 truncate text-sm font-medium">
              {item.message.subject || "No subject"}
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {item.message.snippet || "No snippet captured."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  statusClassName[item.message.processingStatus],
                )}
              >
                {statusLabel[item.message.processingStatus]}
              </Badge>
              <Badge variant="secondary" className="text-[10px] capitalize">
                {item.message.messageType.replace(/_/g, " ")}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {formatConfidence(item.message.matchConfidence)} confidence
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        {item.sourceUrl ? (
          <Button asChild size="sm" variant="outline" className="h-8">
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open in Gmail: ${item.message.subject || sender}`}
            >
              Open in Gmail
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        ) : (
          <div className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 px-2 text-xs text-muted-foreground">
            <MailWarning className="h-3.5 w-3.5" />
            Gmail link unavailable
          </div>
        )}
      </div>
    </article>
  );
};

export const JobEmailsPanel: React.FC<JobEmailsPanelProps> = ({ jobId }) => {
  const [activeFilter, setActiveFilter] = React.useState<EmailFilter>("all");
  const emailsQuery = useQuery({
    queryKey: queryKeys.jobs.emails(jobId, JOB_EMAIL_LIMIT),
    queryFn: () => api.getJobEmails(jobId, { limit: JOB_EMAIL_LIMIT }),
  });

  useQueryErrorToast(
    emailsQuery.error,
    "Failed to load captured emails. Please try again.",
  );

  const items = emailsQuery.data?.items ?? [];
  const filter = filterOptions.find((option) => option.id === activeFilter);
  const filteredItems = items.filter((item) =>
    filter?.matches(item.message.processingStatus),
  );
  const accountLabel = getAccountLabel(items);

  return (
    <section className="rounded-xl border border-border/50 bg-card/85">
      <div className="border-b border-border/50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Mail className="h-4 w-4" />
            <div>
              <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
                Captured emails
                <Badge variant="secondary" className="text-[10px]">
                  {emailsQuery.isLoading
                    ? "Loading"
                    : `${filteredItems.length} of ${
                        emailsQuery.data?.total ?? items.length
                      }`}
                </Badge>
              </div>
              {accountLabel && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {accountLabel}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {filterOptions.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant={activeFilter === option.id ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setActiveFilter(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4">
        {emailsQuery.isLoading && (
          <EmptyState
            title="Loading captured emails"
            description="Checking stored post-application message metadata for this job."
          />
        )}

        {!emailsQuery.isLoading && emailsQuery.isError && (
          <EmptyState
            title="Emails could not be loaded"
            description="The saved email metadata is temporarily unavailable."
            icon={MailWarning}
          />
        )}

        {!emailsQuery.isLoading &&
          !emailsQuery.isError &&
          items.length === 0 && (
            <EmptyState
              title="No linked emails"
              description="When post-application messages are linked to this job, their stored sender, subject, status, and snippet will appear here."
            />
          )}

        {!emailsQuery.isLoading &&
          !emailsQuery.isError &&
          items.length > 0 &&
          filteredItems.length === 0 && (
            <EmptyState
              title="No emails match this filter"
              description="Try another status filter to see the captured messages linked to this job."
            />
          )}

        {!emailsQuery.isLoading &&
          !emailsQuery.isError &&
          filteredItems.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border/60 bg-background/20">
              {filteredItems.map((item) => (
                <EmailRow key={item.message.id} item={item} />
              ))}
            </div>
          )}
      </div>
    </section>
  );
};

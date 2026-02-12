import type { JobListItem, PostApplicationInboxItem } from "@shared/types";
import { CheckCircle2, CircleUserRound, XCircle } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { formatDateTime } from "@/lib/utils";

type EmailViewerRowProps = {
  item: PostApplicationInboxItem;
  jobs: JobListItem[];
  selectedAppliedJobId: string;
  onAppliedJobChange: (jobId: string) => void;
  onApprove: () => void;
  onDeny: () => void;
  isActionLoading: boolean;
  isAppliedJobsLoading: boolean;
};

export type EmailViewerListProps = {
  items: PostApplicationInboxItem[];
  appliedJobs: JobListItem[];
  appliedJobByMessageId: Record<string, string>;
  onAppliedJobChange: (messageId: string, value: string) => void;
  onDecision: (
    item: PostApplicationInboxItem,
    decision: "approve" | "deny",
  ) => void;
  isActionLoading: boolean;
  isAppliedJobsLoading: boolean;
};

function formatEpochMs(value?: number | null): string {
  if (!value) return "n/a";
  return formatDateTime(new Date(value).toISOString()) ?? "n/a";
}

function getSenderLabel(
  senderName: string | null,
  fromAddress: string,
): string {
  const preferred = (senderName ?? "").trim();
  if (preferred) return preferred;
  const trimmed = fromAddress.trim();
  if (!trimmed) return "Unknown sender";
  const bracketIndex = trimmed.indexOf("<");
  if (bracketIndex > 0) {
    return trimmed.slice(0, bracketIndex).trim() || trimmed;
  }
  return trimmed;
}

function scoreTextClass(score: number | null): string {
  if (score === null) return "text-muted-foreground/60";
  if (score >= 95) return "text-emerald-400/90";
  if (score >= 50) return "text-foreground/70";
  return "text-muted-foreground/60";
}

function formatAppliedJobLabel(job: JobListItem): string {
  const employer = job.employer.trim();
  const title = job.title.trim();
  if (employer && title) return `${employer} - ${title}`;
  if (title) return title;
  if (employer) return employer;
  return job.id;
}

const EmailViewerRow: React.FC<EmailViewerRowProps> = ({
  item,
  jobs,
  selectedAppliedJobId,
  onAppliedJobChange,
  onApprove,
  onDeny,
  isActionLoading,
  isAppliedJobsLoading,
}) => {
  const score = item.message.matchConfidence;
  const isActionable = item.message.processingStatus === "pending_user";
  const canDecide = isActionable && !!selectedAppliedJobId;
  const appliedJobOptions = jobs.map((job) => ({
    value: job.id,
    label: formatAppliedJobLabel(job),
    searchText: `${job.employer} ${job.title} ${job.location ?? ""}`.trim(),
  }));

  return (
    <div className="flex flex-col gap-3 border-b bg-card/40 px-3 py-3 last:border-b-0 lg:flex-row lg:items-center">
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-muted/50 text-muted-foreground">
            <CircleUserRound className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {getSenderLabel(
                item.message.senderName,
                item.message.fromAddress,
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {item.message.fromAddress} ·{" "}
              {formatEpochMs(item.message.receivedAt)}
            </p>
          </div>
        </div>

        <p className="truncate text-sm font-medium">{item.message.subject}</p>
        {item.message.matchedJobId ? null : (
          <p className="text-xs text-amber-600">
            Relevant email with no reliable job match. Please select the correct
            job.
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2 lg:ml-auto lg:w-[440px]">
        <SearchableDropdown
          value={selectedAppliedJobId}
          options={appliedJobOptions}
          onValueChange={onAppliedJobChange}
          placeholder={isAppliedJobsLoading ? "Loading jobs..." : "Select job"}
          searchPlaceholder="Search jobs..."
          emptyText={
            isAppliedJobsLoading ? "Loading jobs..." : "No jobs found."
          }
          disabled={isActionLoading}
          triggerClassName="min-w-0 flex-1"
          contentClassName="w-[360px]"
          ariaLabel="Select job"
        />

        <span
          className={`shrink-0 text-xs tabular-nums ${scoreTextClass(score)}`}
        >
          {score === null ? "n/a" : `${Math.round(score)}%`}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            aria-label="Confirm email-job match"
            title="Confirm email-job match"
            onClick={onApprove}
            disabled={isActionLoading || !canDecide}
            className="h-8 w-8 p-0"
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="Ignore this match"
            title="Ignore this match"
            onClick={onDeny}
            disabled={isActionLoading || !isActionable}
            className="h-8 w-8 p-0"
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export const EmailViewerList: React.FC<EmailViewerListProps> = ({
  items,
  appliedJobs,
  appliedJobByMessageId,
  onAppliedJobChange,
  onDecision,
  isActionLoading,
  isAppliedJobsLoading,
}) => {
  return (
    <div className="overflow-hidden rounded-lg border">
      {items.map((item) => {
        const selectedAppliedJobId =
          appliedJobByMessageId[item.message.id] ||
          item.message.matchedJobId ||
          "";

        return (
          <EmailViewerRow
            key={item.message.id}
            item={item}
            jobs={appliedJobs}
            selectedAppliedJobId={selectedAppliedJobId}
            onAppliedJobChange={(value) =>
              onAppliedJobChange(item.message.id, value)
            }
            onApprove={() => onDecision(item, "approve")}
            onDeny={() => onDecision(item, "deny")}
            isActionLoading={isActionLoading}
            isAppliedJobsLoading={isAppliedJobsLoading}
          />
        );
      })}
    </div>
  );
};

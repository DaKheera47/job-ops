import type { Job, JobChatThread } from "@shared/types";
import type React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThreadListProps = {
  job: Job;
  threads: JobChatThread[];
  previews: Record<string, string>;
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  disabled?: boolean;
};

function formatRelativeTime(value: string | null): string {
  if (!value) return "Updated just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absMs < hour) {
    const magnitudeMinutes = Math.max(1, Math.round(absMs / minute));
    const minutes = Math.sign(diffMs) * magnitudeMinutes;
    return `Updated ${rtf.format(minutes, "minute")}`;
  }
  if (absMs < day) {
    const hours = Math.round(diffMs / hour);
    return `Updated ${rtf.format(hours, "hour")}`;
  }
  const days = Math.round(diffMs / day);
  return `Updated ${rtf.format(days, "day")}`;
}

function normalizeThreadTitle(input: string | null, fallback: string): string {
  const value = input?.trim();
  return value && value.length > 0 ? value : fallback;
}

export const ThreadList: React.FC<ThreadListProps> = ({
  job,
  threads,
  previews,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  disabled,
}) => {
  const titleCounts = new Map<string, number>();
  threads.forEach((thread) => {
    const normalized = normalizeThreadTitle(
      thread.title,
      `${job.title} @ ${job.employer}`,
    );
    titleCounts.set(normalized, (titleCounts.get(normalized) ?? 0) + 1);
  });

  const seenTitles = new Map<string, number>();

  return (
    <aside className="min-h-0 space-y-3 pr-0 md:pr-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Threads
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onCreateThread}
          disabled={disabled}
          className="h-8 px-2.5 text-xs"
        >
          New
        </Button>
      </div>

      <div className="max-h-[13rem] space-y-1 overflow-auto pr-1">
        {threads.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">
            No threads yet
          </div>
        ) : (
          threads.map((thread) => {
            const rawTitle = normalizeThreadTitle(
              thread.title,
              `${job.title} @ ${job.employer}`,
            );
            const seenCount = (seenTitles.get(rawTitle) ?? 0) + 1;
            seenTitles.set(rawTitle, seenCount);
            const hasDuplicates = (titleCounts.get(rawTitle) ?? 0) > 1;
            const title = hasDuplicates
              ? `${rawTitle} (${seenCount})`
              : rawTitle;
            const preview = previews[thread.id]?.trim() || "No messages yet";
            const isActive = activeThreadId === thread.id;

            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread.id)}
                disabled={disabled}
                className={cn(
                  "relative w-full rounded-md border px-3 py-2.5 text-left transition-colors",
                  isActive
                    ? "border-foreground/25 bg-accent text-accent-foreground"
                    : "border-transparent hover:border-border/50 hover:bg-muted/40",
                )}
              >
                {isActive && (
                  <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r bg-foreground" />
                )}
                <div
                  className={cn(
                    "truncate pr-2 text-xs",
                    isActive ? "font-semibold" : "font-medium text-foreground",
                  )}
                >
                  {title}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {formatRelativeTime(thread.lastMessageAt ?? thread.updatedAt)}
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground/90">
                  {preview}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};

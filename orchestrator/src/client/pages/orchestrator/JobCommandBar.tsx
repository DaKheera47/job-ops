import { isMetaKeyPressed } from "@client/lib/meta-key";
import type { Job } from "@shared/types.js";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { FilterTab } from "./constants";
import {
  extractLeadingAtToken,
  getFilterTab,
  getLockMatchesFromAliasPrefix,
  groupJobsForCommandBar,
  jobMatchesLock,
  orderCommandGroups,
  resolveLockFromAliasPrefix,
  type StatusLock,
  stripLeadingAtToken,
} from "./JobCommandBar.utils";
import { JobCommandBarLockBadge } from "./JobCommandBarLockBadge";
import { JobCommandBarLockSuggestions } from "./JobCommandBarLockSuggestions";
import { JobRowContent } from "./JobRowContent";

interface JobCommandBarProps {
  jobs: Job[];
  onSelectJob: (tab: FilterTab, jobId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const JobCommandBar: React.FC<JobCommandBarProps> = ({
  jobs,
  onSelectJob,
  open,
  onOpenChange,
}) => {
  const lockDialogAccentClass: Record<StatusLock, string> = {
    ready:
      "border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_0_36px_-12px_rgba(16,185,129,0.55)]",
    discovered:
      "border-sky-500/50 shadow-[0_0_0_1px_rgba(14,165,233,0.2),0_0_36px_-12px_rgba(14,165,233,0.55)]",
    applied:
      "border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_0_36px_-12px_rgba(16,185,129,0.55)]",
    skipped:
      "border-rose-500/50 shadow-[0_0_0_1px_rgba(244,63,94,0.2),0_0_36px_-12px_rgba(244,63,94,0.55)]",
    expired:
      "border-zinc-400/40 shadow-[0_0_0_1px_rgba(161,161,170,0.2),0_0_32px_-12px_rgba(161,161,170,0.45)]",
  };
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeLock, setActiveLock] = useState<StatusLock | null>(null);
  const isOpenControlled = typeof open === "boolean";
  const isOpen = isOpenControlled ? open : internalOpen;

  const setDialogOpen = useCallback(
    (nextOpen: boolean) => {
      if (!isOpenControlled) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isOpenControlled, onOpenChange],
  );

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setActiveLock(null);
  }, [setDialogOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return;
      if (!isMetaKeyPressed(event)) return;
      event.preventDefault();
      if (isOpen) {
        closeDialog();
        return;
      }
      setDialogOpen(true);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDialog, isOpen, setDialogOpen]);

  const normalizedQuery = query.trim().toLowerCase();
  const scopedJobs = useMemo(() => {
    if (!activeLock) return jobs;
    return jobs.filter((job) => jobMatchesLock(job, activeLock));
  }, [activeLock, jobs]);

  const groupedJobs = useMemo(
    () => groupJobsForCommandBar(scopedJobs, normalizedQuery),
    [normalizedQuery, scopedJobs],
  );

  const orderedGroups = useMemo(
    () => orderCommandGroups(groupedJobs, normalizedQuery),
    [groupedJobs, normalizedQuery],
  );

  const applyLock = (lock: StatusLock) => {
    setActiveLock(lock);
    setQuery((current) => stripLeadingAtToken(current));
  };

  useEffect(() => {
    if (isOpen) return;
    setActiveLock(null);
  }, [isOpen]);

  const lockSuggestions = useMemo(() => {
    if (activeLock) return [];
    const token = extractLeadingAtToken(query);
    if (token === null) return [];
    return getLockMatchesFromAliasPrefix(token);
  }, [activeLock, query]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      (event.key === "Tab" || event.key === "Enter") &&
      !event.shiftKey &&
      !event.altKey
    ) {
      const token = extractLeadingAtToken(query);
      if (!token) return;
      const nextLock = resolveLockFromAliasPrefix(token);
      if (!nextLock) return;

      event.preventDefault();
      applyLock(nextLock);
      return;
    }

    if (event.key === "Backspace" && query.length === 0 && activeLock) {
      event.preventDefault();
      setActiveLock(null);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDialogOpen(true);
      return;
    }
    closeDialog();
  };

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={handleOpenChange}
      onEscapeKeyDown={(event) => {
        if (!activeLock) return;
        event.preventDefault();
        setActiveLock(null);
      }}
      contentClassName={`max-w-4xl transition-[border-color,box-shadow] duration-200 ${activeLock ? lockDialogAccentClass[activeLock] : ""}`}
    >
      <DialogTitle className="sr-only">Job Search</DialogTitle>
      <DialogDescription className="sr-only">
        Search jobs across all states by job title or company name.
      </DialogDescription>
      <CommandInput
        placeholder="Search jobs by job title or company name..."
        value={query}
        onValueChange={setQuery}
        onKeyDown={handleInputKeyDown}
        prefix={
          activeLock ? (
            <JobCommandBarLockBadge activeLock={activeLock} />
          ) : undefined
        }
      />
      <div className="px-3 py-1 text-[11px] text-muted-foreground border-b">
        Use <span className="font-mono">@</span> + status + Tab/Enter to lock a
        status. Backspace on empty search clears the lock.
      </div>
      <CommandList className="max-h-[65vh]">
        <CommandEmpty>No jobs found.</CommandEmpty>
        {!activeLock && (
          <JobCommandBarLockSuggestions
            suggestions={lockSuggestions}
            onSelect={applyLock}
          />
        )}
        {orderedGroups.map((group, index) => {
          const items = groupedJobs[group.id];
          if (items.length === 0) return null;
          return (
            <div key={group.id}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {items.map((job) => {
                  return (
                    <CommandItem
                      key={job.id}
                      value={`${job.id} ${job.title} ${job.employer}`}
                      keywords={[job.title, job.employer]}
                      onSelect={() => {
                        closeDialog();
                        onSelectJob(getFilterTab(job.status), job.id);
                      }}
                    >
                      <JobRowContent job={job} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
};

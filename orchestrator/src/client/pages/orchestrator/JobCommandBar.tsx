import type { Job } from "@shared/types.js";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
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
}

export const JobCommandBar: React.FC<JobCommandBarProps> = ({
  jobs,
  onSelectJob,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeLock, setActiveLock] = useState<StatusLock | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const closeDialog = () => {
    setOpen(false);
    setActiveLock(null);
  };

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
      setOpen(true);
      return;
    }
    closeDialog();
  };

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
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
      <CommandList>
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

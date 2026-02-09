import type { Job, JobStatus } from "@shared/types.js";
import { X } from "lucide-react";
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
  CommandShortcut,
} from "@/components/ui/command";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { FilterTab } from "./constants";
import { defaultStatusToken, statusTokens } from "./constants";

interface JobCommandBarProps {
  jobs: Job[];
  onSelectJob: (tab: FilterTab, jobId: string) => void;
}

type CommandGroupId = "ready" | "discovered" | "applied" | "other";
type StatusLock = "ready" | "discovered" | "applied" | "skipped" | "expired";

const commandGroupMeta: Array<{ id: CommandGroupId; heading: string }> = [
  { id: "ready", heading: "Ready" },
  { id: "discovered", heading: "Discovered" },
  { id: "applied", heading: "Applied" },
  { id: "other", heading: "Other" },
];

const lockAliases: Record<StatusLock, string[]> = {
  ready: ["ready", "rdy"],
  discovered: ["discovered", "discover", "disc"],
  applied: ["applied", "apply", "app"],
  skipped: ["skipped", "skip", "skp"],
  expired: ["expired", "expire", "exp"],
};

const getCommandGroup = (status: JobStatus): CommandGroupId => {
  if (status === "ready") return "ready";
  if (status === "discovered" || status === "processing") return "discovered";
  if (status === "applied") return "applied";
  return "other";
};

const getFilterTab = (status: JobStatus): FilterTab => {
  if (status === "ready") return "ready";
  if (status === "discovered" || status === "processing") return "discovered";
  if (status === "applied") return "applied";
  return "all";
};

const parseTime = (value: string | null) => {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const lockLabel: Record<StatusLock, string> = {
  ready: "ready",
  discovered: "discovered",
  applied: "applied",
  skipped: "skipped",
  expired: "expired",
};

const tokenRegex = /^\s*@([a-z-]*)/i;

const extractLeadingAtToken = (input: string) => {
  const match = tokenRegex.exec(input);
  if (!match) return null;
  return match[1].toLowerCase();
};

const stripLeadingAtToken = (input: string) =>
  input.replace(tokenRegex, "").trimStart();

const getLockMatchesFromAliasPrefix = (rawToken: string): StatusLock[] => {
  const token = rawToken.trim().toLowerCase();
  if (!token) return Object.keys(lockAliases) as StatusLock[];

  const matches: StatusLock[] = [];
  for (const [status, aliases] of Object.entries(lockAliases) as Array<
    [StatusLock, string[]]
  >) {
    if (aliases.some((alias) => alias.startsWith(token))) {
      matches.push(status);
    }
  }
  return matches;
};

const resolveLockFromAliasPrefix = (rawToken: string): StatusLock | null => {
  const matches = getLockMatchesFromAliasPrefix(rawToken);
  if (matches.length !== 1) return null;
  return matches[0];
};

const jobMatchesLock = (job: Job, lock: StatusLock) => {
  if (lock === "ready") return job.status === "ready";
  if (lock === "discovered") return job.status === "discovered";
  if (lock === "applied") return job.status === "applied";
  if (lock === "skipped") return job.status === "skipped";
  if (lock === "expired") return job.status === "expired";
  return false;
};

const toStateLabel = (status: JobStatus) => {
  if (status === "processing") return "Discovered";
  if (status === "discovered") return "Discovered";
  return (statusTokens[status] ?? defaultStatusToken).label;
};

const computeFieldMatchScore = (fieldRaw: string, needleRaw: string) => {
  const field = fieldRaw.trim().toLowerCase();
  const needle = needleRaw.trim().toLowerCase();
  if (!field || !needle) return 0;
  if (field === needle) return 1000;

  const words = field.split(/\s+/).filter(Boolean);
  if (words.includes(needle)) return 920;
  if (field.startsWith(needle)) return 880;
  if (words.some((word) => word.startsWith(needle))) return 820;
  if (field.includes(needle)) return 760;

  const compactField = field.replace(/\s+/g, "");
  if (compactField.includes(needle)) return 700;

  // Light typo-tolerance via ordered-character subsequence matching.
  let matchIndex = 0;
  for (const character of compactField) {
    if (character === needle[matchIndex]) {
      matchIndex += 1;
      if (matchIndex === needle.length) break;
    }
  }
  if (matchIndex === needle.length) {
    const density = needle.length / compactField.length;
    return Math.round(500 + density * 100);
  }
  return 0;
};

const computeJobMatchScore = (job: Job, normalizedQuery: string) => {
  if (!normalizedQuery) return 0;
  const titleScore = computeFieldMatchScore(job.title, normalizedQuery);
  const employerScore = computeFieldMatchScore(job.employer, normalizedQuery);
  const locationScore = computeFieldMatchScore(
    job.location ?? "",
    normalizedQuery,
  );

  // Prefer title/company matches over location when scores tie.
  return Math.max(titleScore + 8, employerScore + 12, locationScore);
};

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

  const groupedJobs = useMemo(() => {
    const groups: Record<CommandGroupId, Job[]> = {
      ready: [],
      discovered: [],
      applied: [],
      other: [],
    };

    const sorted = [...scopedJobs].sort((a, b) => {
      if (normalizedQuery) {
        const firstScore = computeJobMatchScore(a, normalizedQuery);
        const secondScore = computeJobMatchScore(b, normalizedQuery);
        if (firstScore !== secondScore) return secondScore - firstScore;
      }

      const first = parseTime(a.discoveredAt);
      const second = parseTime(b.discoveredAt);
      if (!Number.isNaN(first) && !Number.isNaN(second)) {
        return second - first;
      }
      if (!Number.isNaN(first)) return -1;
      if (!Number.isNaN(second)) return 1;
      return b.id.localeCompare(a.id);
    });

    for (const job of sorted) {
      groups[getCommandGroup(job.status)].push(job);
    }
    return groups;
  }, [normalizedQuery, scopedJobs]);

  const orderedGroups = useMemo(() => {
    if (!normalizedQuery) return commandGroupMeta;

    const withScores = commandGroupMeta.map((group) => {
      const maxScore = groupedJobs[group.id].reduce(
        (currentMax, job) =>
          Math.max(currentMax, computeJobMatchScore(job, normalizedQuery)),
        0,
      );
      return {
        ...group,
        maxScore,
      };
    });

    return withScores.sort((a, b) => {
      if (a.maxScore !== b.maxScore) return b.maxScore - a.maxScore;
      return (
        commandGroupMeta.findIndex((group) => group.id === a.id) -
        commandGroupMeta.findIndex((group) => group.id === b.id)
      );
    });
  }, [groupedJobs, normalizedQuery]);

  const applyLock = (lock: StatusLock) => {
    setActiveLock(lock);
    setQuery((current) => stripLeadingAtToken(current));
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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <DialogTitle className="sr-only">Job Search</DialogTitle>
      <DialogDescription className="sr-only">
        Search jobs across all states by job title or company name.
      </DialogDescription>
      <CommandInput
        placeholder="Search jobs by job title or company name..."
        value={query}
        onValueChange={setQuery}
        onKeyDown={handleInputKeyDown}
      />
      {activeLock && (
        <div className="flex items-center border-b px-3 py-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold tracking-wide ${
              (statusTokens[activeLock] ?? defaultStatusToken).badge
            }`}
          >
            @{lockLabel[activeLock]}
            <button
              type="button"
              className="inline-flex items-center rounded-full p-0.5 hover:bg-black/20"
              aria-label={`Remove ${lockLabel[activeLock]} filter`}
              onClick={() => setActiveLock(null)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}
      <CommandList>
        <CommandEmpty>No jobs found.</CommandEmpty>
        {!activeLock && lockSuggestions.length > 0 && (
          <CommandGroup heading="Filters">
            {lockSuggestions.map((lock) => {
              const token = statusTokens[lock] ?? defaultStatusToken;
              return (
                <CommandItem
                  key={lock}
                  value={`@${lockLabel[lock]} filter`}
                  keywords={[`@${lockLabel[lock]}`, lockLabel[lock]]}
                  onSelect={() => applyLock(lock)}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${token.dot}`} />
                    <span className="truncate text-sm font-medium">
                      Lock to @{lockLabel[lock]}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {orderedGroups.map((group, index) => {
          const items = groupedJobs[group.id];
          if (items.length === 0) return null;
          return (
            <div key={group.id}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {items.map((job) => {
                  const statusToken =
                    statusTokens[job.status] ?? defaultStatusToken;
                  return (
                    <CommandItem
                      key={job.id}
                      value={`${job.id} ${job.title} ${job.employer}`}
                      keywords={[job.title, job.employer]}
                      onSelect={() => {
                        setOpen(false);
                        onSelectJob(getFilterTab(job.status), job.id);
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">
                          {job.title}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {job.employer}
                          {job.location ? ` - ${job.location}` : ""}
                        </span>
                      </div>
                      <CommandShortcut
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${statusToken.badge}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${statusToken.dot}`}
                        />
                        {toStateLabel(job.status)}
                      </CommandShortcut>
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

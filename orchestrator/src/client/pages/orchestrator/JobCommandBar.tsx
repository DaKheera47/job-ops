import type { Job, JobStatus } from "@shared/types.js";
import { Search } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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

const commandGroupMeta: Array<{ id: CommandGroupId; heading: string }> = [
  { id: "ready", heading: "Ready" },
  { id: "discovered", heading: "Discovered" },
  { id: "applied", heading: "Applied" },
  { id: "other", heading: "Other" },
];

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
  const shortcutLabel = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl+K";
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
      ? "Cmd+K"
      : "Ctrl+K";
  }, []);

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

  const groupedJobs = useMemo(() => {
    const groups: Record<CommandGroupId, Job[]> = {
      ready: [],
      discovered: [],
      applied: [],
      other: [],
    };

    const sorted = [...jobs].sort((a, b) => {
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
  }, [jobs, normalizedQuery]);

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

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 w-full items-center justify-between text-muted-foreground"
        aria-label="Open job search command menu"
      >
        <span className="inline-flex min-w-0 items-center gap-2 truncate text-sm">
          <Search className="h-4 w-4 shrink-0" />
          Search jobs by title or company name...
        </span>
        <span className="hidden rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 sm:inline-flex">
          {shortcutLabel}
        </span>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Job Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search jobs across all states by job title or company name.
        </DialogDescription>
        <CommandInput
          placeholder="Search jobs by job title or company name..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No jobs found.</CommandEmpty>
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
    </>
  );
};

/**
 * Job list with filtering tabs.
 */

import React, { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Loader2, RefreshCcw, Search, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Job, JobStatus } from "../../shared/types";
import { JobCard } from "./JobCard";
import { JobTable, type JobSort } from "./JobTable";

interface JobListProps {
  jobs: Job[];
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  onProcess: (id: string) => void;
  onProcessAll: () => void;
  processingJobId: string | null;
  isProcessingAll: boolean;
}

type FilterTab = "ready" | "discovered" | "applied" | "all";
type ViewMode = "cards" | "table";

const JOB_LIST_VIEW_STORAGE_KEY = "jobops.jobs.viewMode";
const DEFAULT_SORT: JobSort = { key: "discoveredAt", direction: "desc" };

const tabs: Array<{ id: FilterTab; label: string; statuses: JobStatus[] }> = [
  { id: "ready", label: "Ready", statuses: ["ready"] },
  { id: "discovered", label: "Discovered", statuses: ["discovered", "processing"] },
  { id: "applied", label: "Applied", statuses: ["applied"] },
  { id: "all", label: "All Jobs", statuses: [] },
];

const emptyStateCopy: Record<FilterTab, string> = {
  ready: "Run the pipeline to discover and process new jobs.",
  discovered: "All discovered jobs have been processed.",
  applied: "You haven't applied to any jobs yet.",
  all: "No jobs in the system yet. Run the pipeline to get started!",
};

const statusRank: Record<JobStatus, number> = {
  discovered: 0,
  processing: 1,
  ready: 2,
  applied: 3,
  rejected: 4,
  expired: 5,
};

const dateValue = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const compareNullable = <T,>(
  a: T | null | undefined,
  b: T | null | undefined,
  compare: (left: T, right: T) => number,
) => {
  const left = a ?? null;
  const right = b ?? null;
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return compare(left, right);
};

const compareString = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

const compareNumber = (a: number, b: number) => a - b;

const compareJobs = (a: Job, b: Job, sort: JobSort) => {
  let value = 0;

  switch (sort.key) {
    case "title":
      value = compareString(a.title, b.title);
      break;
    case "employer":
      value = compareString(a.employer, b.employer);
      break;
    case "source":
      value = compareString(a.source, b.source);
      break;
    case "location":
      value = compareNullable(a.location, b.location, compareString);
      break;
    case "status":
      value = statusRank[a.status] - statusRank[b.status];
      break;
    case "score":
      const aScore = a.suitabilityScore;
      const bScore = b.suitabilityScore;

      if (aScore == null && bScore == null) {
        value = 0;
        break;
      }
      if (aScore == null) return 1;
      if (bScore == null) return -1;
      value = compareNumber(aScore, bScore);
      break;
    case "discoveredAt":
      value = compareNullable(dateValue(a.discoveredAt), dateValue(b.discoveredAt), compareNumber);
      break;
    default:
      value = 0;
  }

  if (value !== 0) return sort.direction === "asc" ? value : -value;

  const tieByDiscovered = compareNullable(
    dateValue(b.discoveredAt),
    dateValue(a.discoveredAt),
    compareNumber,
  );
  if (tieByDiscovered !== 0) return tieByDiscovered;

  return a.id.localeCompare(b.id);
};

const jobMatchesQuery = (job: Job, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    job.title,
    job.employer,
    job.location,
    job.disciplines,
    job.salary,
    job.degreeRequired,
    job.starting,
    job.source,
    job.status,
    job.jobType,
    job.jobFunction,
    job.jobLevel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
};

export const JobList: React.FC<JobListProps> = ({
  jobs,
  onApply,
  onReject,
  onProcess,
  onProcessAll,
  processingJobId,
  isProcessingAll,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>("ready");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<JobSort>(DEFAULT_SORT);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const raw = localStorage.getItem(JOB_LIST_VIEW_STORAGE_KEY);
      if (raw === "cards" || raw === "table") return raw;
      return "cards";
    } catch {
      return "cards";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(JOB_LIST_VIEW_STORAGE_KEY, viewMode);
    } catch {
      // Ignore localStorage errors
    }
  }, [viewMode]);

  const counts = useMemo(() => {
    const byTab: Record<FilterTab, number> = {
      ready: 0,
      discovered: 0,
      applied: 0,
      all: jobs.length,
    };

    for (const job of jobs) {
      if (job.status === "ready") byTab.ready += 1;
      if (job.status === "applied") byTab.applied += 1;
      if (job.status === "discovered" || job.status === "processing") byTab.discovered += 1;
    }

    return byTab;
  }, [jobs]);

  const jobsForTab = useMemo(() => {
    const map = new Map<FilterTab, Job[]>();

    for (const tab of tabs) {
      if (tab.statuses.length === 0) {
        map.set(tab.id, jobs);
      } else {
        map.set(tab.id, jobs.filter((job) => tab.statuses.includes(job.status)));
      }
    }

    return map;
  }, [jobs]);

  const visibleJobsForTab = useMemo(() => {
    const map = new Map<FilterTab, Job[]>();
    const normalizedQuery = searchQuery.trim().toLowerCase();

    for (const tab of tabs) {
      const base = jobsForTab.get(tab.id) ?? [];
      const filtered = normalizedQuery ? base.filter((job) => jobMatchesQuery(job, normalizedQuery)) : base;
      const sorted = [...filtered].sort((a, b) => compareJobs(a, b, sort));
      map.set(tab.id, sorted);
    }

    return map;
  }, [jobsForTab, searchQuery, sort]);

  const activeResultsCount = visibleJobsForTab.get(activeTab)?.length ?? 0;
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    sort.key !== DEFAULT_SORT.key ||
    sort.direction !== DEFAULT_SORT.direction;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as FilterTab)}
      className="space-y-4"
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex-1 sm:flex-none">
                {tab.label}
                <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                  ({counts[tab.id]})
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            {activeTab === "discovered" && counts.discovered > 0 && (
              <Button onClick={onProcessAll} disabled={isProcessingAll} size="sm">
                {isProcessingAll ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Process All ({counts.discovered})
                  </>
                )}
              </Button>
            )}

            <div className="flex items-center rounded-md border bg-muted/20 p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setViewMode("cards")}
                aria-pressed={viewMode === "cards"}
                className={cn("h-8 w-8", viewMode === "cards" && "bg-background shadow-sm")}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setViewMode("table")}
                aria-pressed={viewMode === "table"}
                className={cn("h-8 w-8", viewMode === "table" && "bg-background shadow-sm")}
                title="List view"
              >
                <Table2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Filter jobs..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-sm tabular-nums text-muted-foreground">{activeResultsCount} jobs</span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSort(DEFAULT_SORT);
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {tabs.map((tab) => {
        const filteredJobs = visibleJobsForTab.get(tab.id) ?? [];
        const trimmedQuery = searchQuery.trim();

        return (
          <TabsContent key={tab.id} value={tab.id} className="space-y-4">
            {filteredJobs.length === 0 ? (
              <Card className="border-dashed bg-muted/20">
                <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <div className="text-base font-semibold">No jobs found</div>
                  <p className="max-w-xl text-sm text-muted-foreground">
                    {trimmedQuery ? `No jobs match "${trimmedQuery}".` : emptyStateCopy[tab.id]}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {viewMode === "table" ? (
                  <Card>
                    <CardContent className="p-0">
                      <JobTable
                        jobs={filteredJobs}
                        sort={sort}
                        onSortChange={setSort}
                        onApply={onApply}
                        onReject={onReject}
                        onProcess={onProcess}
                        processingJobId={processingJobId}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {filteredJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onApply={onApply}
                        onReject={onReject}
                        onProcess={onProcess}
                        isProcessing={processingJobId === job.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
};

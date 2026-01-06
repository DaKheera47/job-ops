/**
 * Job list with filtering tabs.
 */

import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Filter, LayoutGrid, Search, Sparkles, Table2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { Job, JobStatus, JobSource } from "../../shared/types";
import { JobCard } from "./JobCard";
import { JobTable, type JobSort } from "./JobTable";
import { TailoringEditor } from "./TailoringEditor";

interface JobListProps {
  jobs: Job[];
  onApply: (id: string) => void | Promise<void>;
  onReject: (id: string) => void | Promise<void>;
  onProcess: (id: string) => void | Promise<void>;
  onUpdate: () => void | Promise<void>;
  processingJobId: string | null;
}

type FilterTab = "ready" | "discovered" | "applied" | "all";
type ViewMode = "cards" | "table";

const JOB_LIST_VIEW_STORAGE_KEY = "jobops.jobs.viewMode";
const DEFAULT_SORT: JobSort = { key: "discoveredAt", direction: "desc" };

const sortLabels: Record<JobSort["key"], string> = {
  discoveredAt: "Discovered",
  score: "Score",
  title: "Title",
  employer: "Company",
  source: "Source",
  location: "Location",
  status: "Status",
};

const sourceLabels: Record<JobSource, string> = {
  gradcracker: "Gradcracker",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  ukvisajobs: "UK Visa Jobs",
};

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

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export const JobList: React.FC<JobListProps> = ({
  jobs,
  onApply,
  onReject,
  onProcess,
  onUpdate,
  processingJobId,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>("ready");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<JobSource | "all">("all");
  const [sort, setSort] = useState<JobSort>(DEFAULT_SORT);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(() => new Set());
  const [batchAction, setBatchAction] = useState<null | "process" | "reject" | "apply">(null);
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);
  const [isHighlightVisible, setIsHighlightVisible] = useState(false);
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

  useEffect(() => {
    setSelectedJobIds(new Set());
  }, [activeTab, viewMode]);

  useEffect(() => {
    if (!highlightedJobId) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setIsHighlightVisible(false);
    const raf = requestAnimationFrame(() => setIsHighlightVisible(true));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHighlightedJobId(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      setIsHighlightVisible(false);
    };
  }, [highlightedJobId]);

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
      let filtered = jobsForTab.get(tab.id) ?? [];

      if (sourceFilter !== "all") {
        filtered = filtered.filter((job) => job.source === sourceFilter);
      }

      if (normalizedQuery) {
        filtered = filtered.filter((job) => jobMatchesQuery(job, normalizedQuery));
      }

      const sorted = [...filtered].sort((a, b) => compareJobs(a, b, sort));
      map.set(tab.id, sorted);
    }

    return map;
  }, [jobsForTab, searchQuery, sourceFilter, sort]);

  const activeTabJobs = visibleJobsForTab.get(activeTab) ?? [];
  const highlightedJob = useMemo(
    () => (highlightedJobId ? jobs.find((job) => job.id === highlightedJobId) ?? null : null),
    [highlightedJobId, jobs],
  );

  const highlightedJobDescription = useMemo(() => {
    if (!highlightedJob) return "No description available.";
    const jd = highlightedJob.jobDescription || "No description available.";
    if (jd.includes("<") && jd.includes(">")) return stripHtml(jd);
    return jd;
  }, [highlightedJob]);

  useEffect(() => {
    setSelectedJobIds((current) => {
      const visibleIds = new Set(activeTabJobs.map((job) => job.id));
      const next = new Set<string>();
      for (const id of current) {
        if (visibleIds.has(id)) next.add(id);
      }
      return next.size === current.size ? current : next;
    });
  }, [activeTabJobs]);

  const activeResultsCount = visibleJobsForTab.get(activeTab)?.length ?? 0;
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    sourceFilter !== "all" ||
    sort.key !== DEFAULT_SORT.key ||
    sort.direction !== DEFAULT_SORT.direction;

  const selectedJobs = useMemo(() => {
    if (selectedJobIds.size === 0) return [];
    return activeTabJobs.filter((job) => selectedJobIds.has(job.id));
  }, [activeTabJobs, selectedJobIds]);

  const selectedCount = selectedJobIds.size;

  const runBatch = async (action: "process" | "reject" | "apply") => {
    if (selectedJobs.length === 0) return;

    const eligible = selectedJobs.filter((job) => {
      if (action === "process") return job.status === "discovered";
      if (action === "apply") return job.status === "ready";
      return job.status === "discovered" || job.status === "ready";
    });

    const skipped = selectedJobs.length - eligible.length;
    if (eligible.length === 0) {
      toast.message("No eligible jobs selected");
      return;
    }

    setBatchAction(action);
    try {
      for (const job of eligible) {
        if (action === "process") await Promise.resolve(onProcess(job.id));
        if (action === "apply") await Promise.resolve(onApply(job.id));
        if (action === "reject") await Promise.resolve(onReject(job.id));
      }

      setSelectedJobIds(new Set());
      const actionLabel = action === "process" ? "Processed" : action === "apply" ? "Applied" : "Skipped";
      toast.success(`${actionLabel} ${eligible.length} jobs`, skipped > 0 ? { description: `Skipped ${skipped} ineligible.` } : undefined);
    } finally {
      setBatchAction(null);
    }
  };

  return (
    <>
      {highlightedJob && (
        <>
          <div
            className={cn(
              "fixed inset-0 z-40 bg-background/30 backdrop-blur-md backdrop-saturate-150 transition-opacity duration-200 ease-out",
              isHighlightVisible ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setHighlightedJobId(null)}
          />
          <div
            className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-8"
            onClick={() => setHighlightedJobId(null)}
          >
            <div
              className={cn(
                "mx-auto w-full max-w-4xl space-y-4 transition-all duration-200 ease-out",
                isHighlightVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-muted-foreground">Highlighted job</div>
                  <div className="truncate text-base font-semibold">{highlightedJob.title}</div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setHighlightedJobId(null)}
                  aria-label="Close highlight"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <JobCard
                job={highlightedJob}
                onApply={onApply}
                onReject={onReject}
                onProcess={onProcess}
                isProcessing={processingJobId === highlightedJob.id}
                highlightedJobId={highlightedJobId}
                onHighlightChange={setHighlightedJobId}
              />

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="tailoring" className="border-none">
                  <AccordionTrigger className="flex h-12 w-full items-center justify-between rounded-lg border bg-card px-4 py-0 hover:bg-muted/50 hover:no-underline">
                    <div className="flex items-center gap-2 font-semibold">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Resume Tailoring
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4 pb-0">
                    <TailoringEditor job={highlightedJob} onUpdate={onUpdate} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Job description</CardTitle>
                  <div className="text-xs text-muted-foreground">Press Esc or click outside to exit highlight.</div>
                </CardHeader>
                <CardContent className="max-h-[60vh] overflow-auto text-sm text-muted-foreground">
                  <div className="whitespace-pre-wrap leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {highlightedJobDescription}
                    </ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as FilterTab)}
        className="space-y-4"
      >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto h-9">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex-1 sm:flex-none">
                {tab.label}
                <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                  ({counts[tab.id]})
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex items-center justify-between gap-1.5 sm:justify-end">
            <div className="flex items-center rounded-md border bg-muted/20 p-0.5 h-9">
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

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    Source: {sourceFilter === "all" ? "All" : sourceLabels[sourceFilter]}
                  </span>
                  <span className="sm:hidden">Source</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter by source</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={sourceFilter}
                  onValueChange={(value) => setSourceFilter(value as JobSource | "all")}
                >
                  <DropdownMenuRadioItem value="all">All Sources</DropdownMenuRadioItem>
                  {(Object.keys(sourceLabels) as JobSource[]).map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {sourceLabels[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <ArrowUpDown className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    Sort: {sortLabels[sort.key]} {sort.direction === "asc" ? "↑" : "↓"}
                  </span>
                  <span className="sm:hidden">Sort</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={sort.key}
                  onValueChange={(value) =>
                    setSort({
                      key: value as JobSort["key"],
                      direction:
                        value === "score" || value === "discoveredAt"
                          ? "desc"
                          : "asc",
                    })
                  }
                >
                  {(Object.keys(sortLabels) as Array<JobSort["key"]>).map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {sortLabels[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    setSort((current) => ({
                      ...current,
                      direction: current.direction === "asc" ? "desc" : "asc",
                    }))
                  }
                >
                  Direction: {sort.direction === "asc" ? "Ascending" : "Descending"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="text-sm tabular-nums text-muted-foreground">{activeResultsCount} jobs</span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSourceFilter("all");
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
                  <div className="space-y-2">
                    {tab.id === activeTab && selectedCount > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
                        <div className="text-sm">
                          <span className="font-medium">{selectedCount}</span>{" "}
                          <span className="text-muted-foreground">selected</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => runBatch("process")}
                            disabled={batchAction !== null}
                          >
                            Generate Resumes
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => runBatch("reject")}
                            disabled={batchAction !== null}
                          >
                            Skip
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => runBatch("apply")}
                            disabled={batchAction !== null}
                          >
                            Mark Applied
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedJobIds(new Set())}
                            disabled={batchAction !== null}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    )}

                    <Card>
                      <CardContent className="p-0">
                        <JobTable
                          jobs={filteredJobs}
                          sort={sort}
                          onSortChange={setSort}
                          selectedJobIds={selectedJobIds}
                          onSelectedJobIdsChange={setSelectedJobIds}
                          onApply={onApply}
                          onReject={onReject}
                          onProcess={onProcess}
                          processingJobId={processingJobId}
                          highlightedJobId={highlightedJobId}
                          onHighlightChange={setHighlightedJobId}
                        />
                      </CardContent>
                    </Card>
                  </div>
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
                        highlightedJobId={highlightedJobId}
                        onHighlightChange={setHighlightedJobId}
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
    </>
  );
};

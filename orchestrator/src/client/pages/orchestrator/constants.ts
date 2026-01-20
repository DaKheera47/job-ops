import type { JobSource, JobStatus } from "../../../shared/types";

export const DEFAULT_PIPELINE_SOURCES: JobSource[] = ["gradcracker", "indeed", "linkedin", "ukvisajobs"];
export const PIPELINE_SOURCES_STORAGE_KEY = "jobops.pipeline.sources";

export const orderedSources: JobSource[] = ["gradcracker", "indeed", "linkedin", "ukvisajobs"];

export const statusTokens: Record<JobStatus, { label: string; badge: string; dot: string }> = {
  discovered: {
    label: "Discovered",
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    dot: "bg-sky-400",
  },
  processing: {
    label: "Processing",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-400",
  },
  ready: {
    label: "Ready",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  applied: {
    label: "Applied",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  skipped: {
    label: "Skipped",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
  },
  expired: {
    label: "Expired",
    badge: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

export const defaultStatusToken = {
  label: "Unknown",
  badge: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
  dot: "bg-muted-foreground",
};

export type FilterTab = "ready" | "discovered" | "applied" | "all";

export type SortKey = "discoveredAt" | "score" | "title" | "employer";
export type SortDirection = "asc" | "desc";

export interface JobSort {
  key: SortKey;
  direction: SortDirection;
}

export const DEFAULT_SORT: JobSort = { key: "score", direction: "desc" };

export const sortLabels: Record<JobSort["key"], string> = {
  discoveredAt: "Discovered",
  score: "Score",
  title: "Title",
  employer: "Company",
};

export const defaultSortDirection: Record<JobSort["key"], SortDirection> = {
  discoveredAt: "desc",
  score: "desc",
  title: "asc",
  employer: "asc",
};

export const tabs: Array<{ id: FilterTab; label: string; statuses: JobStatus[] }> = [
  { id: "ready", label: "Ready", statuses: ["ready"] },
  { id: "discovered", label: "Discovered", statuses: ["discovered", "processing"] },
  { id: "applied", label: "Applied", statuses: ["applied"] },
  { id: "all", label: "All Jobs", statuses: [] },
];

export const emptyStateCopy: Record<FilterTab, string> = {
  ready: "Run the pipeline to discover and process new jobs.",
  discovered: "All discovered jobs have been processed.",
  applied: "You have not applied to any jobs yet.",
  all: "No jobs in the system yet. Run the pipeline to get started.",
};

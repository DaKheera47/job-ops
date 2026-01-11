/**
 * Orchestrator layout with a split list/detail experience.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  DollarSign,
  Edit2,
  ExternalLink,
  FileText,
  Filter,
  GraduationCap,
  Loader2,
  MapPin,
  MoreHorizontal,
  Play,
  RefreshCcw,
  Save,
  Search,
  Settings,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { copyTextToClipboard, formatJobForWebhook } from "@client/lib/jobCopy";
import { PipelineProgress } from "../components";
import * as api from "../api";
import { TailoringEditor } from "../components/TailoringEditor";
import type { Job, JobSource, JobStatus } from "../../shared/types";

const DEFAULT_PIPELINE_SOURCES: JobSource[] = ["gradcracker", "indeed", "linkedin", "ukvisajobs"];
const PIPELINE_SOURCES_STORAGE_KEY = "jobops.pipeline.sources";

const sourceLabel: Record<JobSource, string> = {
  gradcracker: "Gradcracker",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  ukvisajobs: "UK Visa Jobs",
};

const orderedSources: JobSource[] = ["gradcracker", "indeed", "linkedin", "ukvisajobs"];

const statusTokens: Record<
  JobStatus,
  { label: string; badge: string; dot: string }
> = {
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
  rejected: {
    label: "Rejected",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
  },
  expired: {
    label: "Expired",
    badge: "border-muted-foreground/20 bg-muted/30 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
};

type FilterTab = "ready" | "discovered" | "applied" | "all";

type SortKey = "discoveredAt" | "score" | "title" | "employer";
type SortDirection = "asc" | "desc";

interface JobSort {
  key: SortKey;
  direction: SortDirection;
}

const DEFAULT_SORT: JobSort = { key: "score", direction: "desc" };

const sortLabels: Record<JobSort["key"], string> = {
  discoveredAt: "Discovered",
  score: "Score",
  title: "Title",
  employer: "Company",
};

const defaultSortDirection: Record<JobSort["key"], SortDirection> = {
  discoveredAt: "desc",
  score: "desc",
  title: "asc",
  employer: "asc",
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
  applied: "You have not applied to any jobs yet.",
  all: "No jobs in the system yet. Run the pipeline to get started.",
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return null;
  try {
    const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    const date = parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const time = parsed.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} ${time}`;
  } catch {
    return dateStr;
  }
};

const safeFilenamePart = (value: string) => value.replace(/[^a-z0-9]/gi, "_");

const dateValue = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    case "score": {
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
    }
    case "discoveredAt":
      const aDate = dateValue(a.discoveredAt);
      const bDate = dateValue(b.discoveredAt);
      if (aDate == null && bDate == null) {
        value = 0;
        break;
      }
      if (aDate == null) return 1;
      if (bDate == null) return -1;
      value = compareNumber(aDate, bDate);
      break;
    default:
      value = 0;
  }

  if (value !== 0) return sort.direction === "asc" ? value : -value;
  return a.id.localeCompare(b.id);
};

const jobMatchesQuery = (job: Job, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    job.title,
    job.employer,
    job.location,
    job.source,
    job.status,
    job.jobType,
    job.jobFunction,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const StatusPill: React.FC<{ status: JobStatus }> = ({ status }) => {
  const tokens = statusTokens[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        tokens.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tokens.dot)} />
      {tokens.label}
    </span>
  );
};

const ScoreMeter: React.FC<{ score: number | null }> = ({ score }) => {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">Not scored</span>;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1.5 w-16 rounded-full bg-muted/40">
        <div
          className="h-1.5 rounded-full bg-primary/80"
          style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
        />
      </div>
      <span className="tabular-nums">{score}</span>
    </div>
  );
};

export const OrchestratorPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Record<JobStatus, number>>({
    discovered: 0,
    processing: 0,
    ready: 0,
    applied: 0,
    rejected: 0,
    expired: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("ready");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<JobSource | "all">("all");
  const [sort, setSort] = useState<JobSort>(DEFAULT_SORT);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "tailoring" | "description">("overview");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [hasUnsavedTailoring, setHasUnsavedTailoring] = useState(false);
  const saveTailoringRef = useRef<null | (() => Promise<void>)>(null);
  const [pipelineSources, setPipelineSources] = useState<JobSource[]>(() => {
    try {
      const raw = localStorage.getItem(PIPELINE_SOURCES_STORAGE_KEY);
      if (!raw) return DEFAULT_PIPELINE_SOURCES;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return DEFAULT_PIPELINE_SOURCES;
      const next = parsed.filter((value): value is JobSource => orderedSources.includes(value as JobSource));
      return next.length > 0 ? next : DEFAULT_PIPELINE_SOURCES;
    } catch {
      return DEFAULT_PIPELINE_SOURCES;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PIPELINE_SOURCES_STORAGE_KEY, JSON.stringify(pipelineSources));
    } catch {
      // Ignore localStorage errors
    }
  }, [pipelineSources]);

  const loadJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.getJobs();
      setJobs(data.jobs);
      setStats(data.byStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load jobs";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkPipelineStatus = useCallback(async () => {
    try {
      const status = await api.getPipelineStatus();
      setIsPipelineRunning(status.isRunning);
    } catch {
      // Ignore errors
    }
  }, []);

  useEffect(() => {
    loadJobs();
    checkPipelineStatus();

    const interval = setInterval(() => {
      loadJobs();
      checkPipelineStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadJobs, checkPipelineStatus]);

  const handleRunPipeline = async () => {
    try {
      setIsPipelineRunning(true);
      await api.runPipeline({ sources: pipelineSources });
      toast.message("Pipeline started", {
        description: `Sources: ${pipelineSources.join(", ")}. This may take a few minutes.`,
      });

      const pollInterval = setInterval(async () => {
        try {
          const status = await api.getPipelineStatus();
          if (!status.isRunning) {
            clearInterval(pollInterval);
            setIsPipelineRunning(false);
            await loadJobs();
            toast.success("Pipeline completed");
          }
        } catch {
          // Ignore errors
        }
      }, 5000);
    } catch (error) {
      setIsPipelineRunning(false);
      const message = error instanceof Error ? error.message : "Failed to start pipeline";
      toast.error(message);
    }
  };

  const handleProcess = async (jobId: string) => {
    try {
      const job = jobs.find((item) => item.id === jobId);
      if (!job) throw new Error("Job not found");

      const shouldProceed = await confirmAndSaveEdits({ includeTailoring: true });
      if (!shouldProceed) return;

      setProcessingJobId(jobId);

      if (job.status === "ready") {
        await api.generateJobPdf(jobId);
        toast.success("Resume regenerated successfully");
      } else {
        await api.processJob(jobId);
        toast.success("Resume generated successfully");
      }
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process job";
      toast.error(message);
    } finally {
      setProcessingJobId(null);
    }
  };

  const handleApply = async (jobId: string) => {
    try {
      await api.markAsApplied(jobId);
      toast.success("Marked as applied");
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark as applied";
      toast.error(message);
    }
  };

  const handleReject = async (jobId: string) => {
    try {
      await api.rejectJob(jobId);
      toast.message("Job skipped");
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reject job";
      toast.error(message);
    }
  };

  const handleCopyInfo = async (job: Job) => {
    try {
      await copyTextToClipboard(formatJobForWebhook(job));
      toast.success("Copied job info", { description: "Webhook payload copied to clipboard." });
    } catch {
      toast.error("Could not copy job info");
    }
  };

  const activeJobs = useMemo(() => {
    let filtered = jobs;

    if (activeTab === "ready") {
      filtered = filtered.filter((job) => job.status === "ready");
    } else if (activeTab === "discovered") {
      filtered = filtered.filter((job) => job.status === "discovered" || job.status === "processing");
    } else if (activeTab === "applied") {
      filtered = filtered.filter((job) => job.status === "applied");
    }

    if (sourceFilter !== "all") {
      filtered = filtered.filter((job) => job.source === sourceFilter);
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter((job) => jobMatchesQuery(job, searchQuery));
    }

    return [...filtered].sort((a, b) => compareJobs(a, b, sort));
  }, [jobs, activeTab, sourceFilter, searchQuery, sort]);

  useEffect(() => {
    if (activeJobs.length === 0) {
      setSelectedJobId(null);
      return;
    }
    if (!selectedJobId || !activeJobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(activeJobs[0].id);
    }
  }, [activeJobs, selectedJobId]);

  const selectedJob = useMemo(
    () => (selectedJobId ? jobs.find((job) => job.id === selectedJobId) ?? null : null),
    [jobs, selectedJobId],
  );

  useEffect(() => {
    setHasUnsavedTailoring(false);
    saveTailoringRef.current = null;
  }, [selectedJob?.id]);

  const description = useMemo(() => {
    if (!selectedJob?.jobDescription) return "No description available.";
    const jd = selectedJob.jobDescription;
    if (jd.includes("<") && jd.includes(">")) return stripHtml(jd);
    return jd;
  }, [selectedJob]);

  useEffect(() => {
    if (!selectedJob) {
      setIsEditingDescription(false);
      setEditedDescription("");
      return;
    }
    setIsEditingDescription(false);
    setEditedDescription(selectedJob.jobDescription || "");
  }, [selectedJob?.id]);

  useEffect(() => {
    if (!selectedJob) return;
    if (!isEditingDescription) {
      setEditedDescription(selectedJob.jobDescription || "");
    }
  }, [selectedJob?.jobDescription, isEditingDescription]);

  const handleSaveDescription = async () => {
    if (!selectedJob) return;
    try {
      setIsSavingDescription(true);
      await api.updateJob(selectedJob.id, { jobDescription: editedDescription });
      toast.success("Job description updated");
      setIsEditingDescription(false);
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update description";
      toast.error(message);
    } finally {
      setIsSavingDescription(false);
    }
  };

  const hasUnsavedDescription =
    !!selectedJob &&
    isEditingDescription &&
    editedDescription !== (selectedJob.jobDescription || "");

  const confirmAndSaveEdits = useCallback(
    async ({ includeTailoring = true }: { includeTailoring?: boolean } = {}) => {
      const pendingDescription = hasUnsavedDescription;
      const pendingTailoring = includeTailoring && hasUnsavedTailoring;

      if (!pendingDescription && !pendingTailoring) return true;

      const parts = [];
      if (pendingDescription) parts.push("job description");
      if (pendingTailoring) parts.push("tailoring changes");

      const message = `You have unsaved ${parts.join(" and ")}. Save before generating the PDF?`;
      if (!window.confirm(message)) return false;

      try {
        if (pendingDescription && selectedJob) {
          await api.updateJob(selectedJob.id, { jobDescription: editedDescription });
        }

        if (pendingTailoring) {
          const saveTailoring = saveTailoringRef.current;
          if (!saveTailoring) {
            toast.error("Could not save tailoring changes");
            return false;
          }
          await saveTailoring();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to save changes";
        toast.error(errorMessage);
        return false;
      }

      return true;
    },
    [editedDescription, hasUnsavedDescription, hasUnsavedTailoring, selectedJob],
  );

  const totalJobs = Object.values(stats).reduce((a, b) => a + b, 0);
  const activeResultsCount = activeJobs.length;
  const selectedHasPdf = !!selectedJob?.pdfPath;
  const selectedJobLink = selectedJob ? selectedJob.applicationLink || selectedJob.jobUrl : "#";
  const selectedPdfHref = selectedJob
    ? `/pdfs/resume_${selectedJob.id}.pdf?v=${encodeURIComponent(selectedJob.updatedAt)}`
    : "#";
  const selectedDeadline = selectedJob ? formatDate(selectedJob.deadline) : null;
  const selectedDiscoveredAt = selectedJob ? formatDateTime(selectedJob.discoveredAt) : null;
  const canApply = selectedJob?.status === "ready";
  const canProcess = selectedJob ? ["discovered", "ready"].includes(selectedJob.status) : false;
  const canReject = selectedJob ? ["discovered", "ready"].includes(selectedJob.status) : false;
  const showReadyPdf = activeTab === "ready";
  const showGeneratePdf = activeTab === "discovered";
  const isProcessingSelected =
    selectedJob ? processingJobId === selectedJob.id || selectedJob.status === "processing" : false;

  const toggleSource = (source: JobSource, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...pipelineSources, source]))
      : pipelineSources.filter((s) => s !== source);

    if (next.length === 0) return;
    setPipelineSources(next);
  };

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

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Job Ops</div>
              <div className="text-xs text-muted-foreground">Orchestrator</div>
            </div>
            {isPipelineRunning && (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                Pipeline running
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={loadJobs} disabled={isLoading} aria-label="Refresh jobs">
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="UK Visa Jobs search">
              <Link to="/ukvisajobs">
                <Search className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Settings">
              <Link to="/settings">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex items-center gap-1">
              <Button size="sm" onClick={handleRunPipeline} disabled={isPipelineRunning} className="gap-2">
                {isPipelineRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isPipelineRunning ? "Running" : "Run pipeline"}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="outline" disabled={isPipelineRunning} aria-label="Select pipeline sources">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Sources</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {orderedSources.map((source) => (
                    <DropdownMenuCheckboxItem
                      key={source}
                      checked={pipelineSources.includes(source)}
                      onCheckedChange={(checked) => toggleSource(source, Boolean(checked))}
                    >
                      {sourceLabel[source]}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setPipelineSources(orderedSources)}>All sources</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPipelineSources(["gradcracker"])}>Gradcracker only</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPipelineSources(["indeed", "linkedin"])}>
                    Indeed + LinkedIn only
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl space-y-6 px-4 py-6 pb-12">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">Pipeline console</h1>
              <p className="text-sm text-muted-foreground">
                Focused workspace with a split list/detail layout and icon-led actions.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">{totalJobs} total jobs</div>
          </div>

          {isPipelineRunning && (
            <div className="max-w-3xl">
              <PipelineProgress isRunning={isPipelineRunning} />
            </div>
          )}

          <div className="grid overflow-hidden rounded-xl border border-border/60 bg-card/40 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Discovered", value: stats.discovered },
              { label: "Processing", value: stats.processing },
              { label: "Ready", value: stats.ready },
              { label: "Applied", value: stats.applied },
              { label: "Rejected", value: stats.rejected },
              { label: "Expired", value: stats.expired },
            ].map((item, index) => (
              <div
                key={item.label}
                className={cn(
                  "flex flex-col justify-between gap-1 px-4 py-3",
                  index > 0 && "border-t border-border/60 sm:border-t-0 sm:border-l",
                  index > 0 && index % 3 === 0 && "sm:border-l-0 sm:border-t",
                  index > 2 && "lg:border-t-0 lg:border-l",
                )}
              >
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className="text-lg font-semibold tabular-nums">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FilterTab)}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="h-9 w-full lg:w-auto">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="flex-1 lg:flex-none">
                    {tab.label}
                    <span className="ml-2 text-xs tabular-nums text-muted-foreground">({counts[tab.id]})</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full min-w-[220px] flex-1 lg:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Filter jobs..."
                    className="pl-9"
                  />
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2">
                      <Filter className="h-4 w-4" />
                      Source: {sourceFilter === "all" ? "All" : sourceLabel[sourceFilter]}
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
                      {(Object.keys(sourceLabel) as JobSource[]).map((key) => (
                        <DropdownMenuRadioItem key={key} value={key}>
                          {sourceLabel[key]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2">
                      <ArrowUpDown className="h-4 w-4" />
                      Sort: {sortLabels[sort.key]}
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
                          direction: defaultSortDirection[value as JobSort["key"]],
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

                <Badge variant="outline" className="h-9 px-3 text-xs tabular-nums text-muted-foreground">
                  {activeResultsCount} jobs
                </Badge>
              </div>
            </div>
          </Tabs>
        </section>
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="rounded-xl border border-border/60 bg-card/40">
            {activeJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <div className="text-base font-semibold">No jobs found</div>
                <p className="max-w-md text-sm text-muted-foreground">
                  {searchQuery.trim() ? `No jobs match "${searchQuery.trim()}".` : emptyStateCopy[activeTab]}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {activeJobs.map((job) => {
                  const isSelected = job.id === selectedJobId;
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className={cn(
                        "flex w-full items-start gap-4 px-4 py-3 text-left transition-colors",
                        isSelected ? "bg-muted/40" : "hover:bg-muted/30",
                      )}
                      aria-pressed={isSelected}
                    >
                      <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", statusTokens[job.status].dot)} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="truncate text-sm font-semibold">{job.title}</div>
                        <div className="text-xs text-muted-foreground">{job.employer}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {job.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {job.location}
                            </span>
                          )}
                          {job.deadline && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDate(job.deadline)}
                            </span>
                          )}
                          {job.discoveredAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              Discovered {formatDateTime(job.discoveredAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <ScoreMeter score={job.suitabilityScore} />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {statusTokens[job.status].label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card/40 p-4 lg:sticky lg:top-24 lg:self-start">
            {!selectedJob ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <div className="text-base font-semibold">Select a job</div>
                <p className="text-sm text-muted-foreground">Pick a job from the list to see details here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{selectedJob.title}</div>
                    <div className="text-sm text-muted-foreground">{selectedJob.employer}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="uppercase tracking-wide">
                      {sourceLabel[selectedJob.source]}
                    </Badge>
                    <StatusPill status={selectedJob.status} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {selectedJob.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {selectedJob.location}
                    </span>
                  )}
                  {selectedDeadline && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {selectedDeadline}
                    </span>
                  )}
                  {selectedDiscoveredAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Discovered {selectedDiscoveredAt}
                    </span>
                  )}
                  {selectedJob.salary && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      {selectedJob.salary}
                    </span>
                  )}
                  {selectedJob.degreeRequired && (
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5" />
                      {selectedJob.degreeRequired}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Suitability</span>
                  <ScoreMeter score={selectedJob.suitabilityScore} />
                </div>

                <Separator />

                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="outline" className="gap-2">
                    <a href={selectedJobLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      View job
                    </a>
                  </Button>

                  {showReadyPdf &&
                    (selectedHasPdf ? (
                      <Button asChild size="sm" variant="outline" className="gap-2">
                        <a href={selectedPdfHref} target="_blank" rel="noopener noreferrer">
                          <FileText className="h-4 w-4" />
                          View PDF
                        </a>
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="gap-2" disabled>
                        <FileText className="h-4 w-4" />
                        View PDF
                      </Button>
                    ))}

                  {showGeneratePdf && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-2"
                      onClick={() => handleProcess(selectedJob.id)}
                      disabled={!canProcess || isProcessingSelected}
                    >
                      {isProcessingSelected ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      {isProcessingSelected ? "Generating..." : "Generate PDF"}
                    </Button>
                  )}

                  {canApply && (
                    <Button
                      size="sm"
                      className="gap-2 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                      onClick={() => handleApply(selectedJob.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark applied
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canProcess && !showGeneratePdf && (
                        <DropdownMenuItem
                          onSelect={() => handleProcess(selectedJob.id)}
                          disabled={isProcessingSelected}
                        >
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          {isProcessingSelected
                            ? "Processing..."
                            : selectedJob.status === "ready"
                              ? "Regenerate PDF"
                              : "Generate PDF"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => {
                          setDetailTab("description");
                          setIsEditingDescription(true);
                        }}
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit description
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void handleCopyInfo(selectedJob)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy info
                      </DropdownMenuItem>
                      {selectedHasPdf && (
                        <>
                          {!showReadyPdf && (
                            <DropdownMenuItem asChild>
                              <a href={selectedPdfHref} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View PDF
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <a
                              href={selectedPdfHref}
                              download={`Shaheer_Sarfaraz_${safeFilenamePart(selectedJob.employer)}.pdf`}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              Download PDF
                            </a>
                          </DropdownMenuItem>
                        </>
                      )}
                      {canReject && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => handleReject(selectedJob.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Skip job
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as typeof detailTab)}>
                  <TabsList className="h-9">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="tailoring">Tailoring</TabsTrigger>
                    <TabsTrigger value="description">Description</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-3 pt-3">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                      {selectedJob.suitabilityReason
                        ? `"${selectedJob.suitabilityReason}"`
                        : "No suitability summary yet."}
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Discipline</div>
                        <div className="font-medium">{selectedJob.disciplines || "Not set"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Job function</div>
                        <div className="font-medium">{selectedJob.jobFunction || "Not set"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Job level</div>
                        <div className="font-medium">{selectedJob.jobLevel || "Not set"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Job type</div>
                        <div className="font-medium">{selectedJob.jobType || "Not set"}</div>
                      </div>
                    </div>

                    <Separator className="my-2" />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Description Preview
                        </div>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs text-primary"
                          onClick={() => {
                            setDetailTab("description");
                            setIsEditingDescription(true);
                          }}
                        >
                          <Edit2 className="mr-1 h-3 w-3" />
                          Edit full JD
                        </Button>
                      </div>
                      <div className="rounded-md border border-border/40 bg-muted/5 p-3 text-xs text-muted-foreground line-clamp-6 whitespace-pre-wrap leading-relaxed">
                        {description}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-8 text-xs text-muted-foreground"
                        onClick={() => setDetailTab("description")}
                      >
                        Read full description
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="tailoring" className="pt-3">
                    <TailoringEditor
                      job={selectedJob}
                      onUpdate={loadJobs}
                      onDirtyChange={setHasUnsavedTailoring}
                      onRegisterSave={(save) => {
                        saveTailoringRef.current = save;
                      }}
                      onBeforeGenerate={() => confirmAndSaveEdits({ includeTailoring: false })}
                    />
                  </TabsContent>

                  <TabsContent value="description" className="space-y-3 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Job description
                      </div>
                      <div className="flex items-center gap-1">
                        {!isEditingDescription ? (
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => setIsEditingDescription(true)}
                            className="h-8 px-2 text-xs"
                          >
                            <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                            Edit
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setIsEditingDescription(false);
                                setEditedDescription(selectedJob.jobDescription || "");
                              }}
                              className="h-8 px-2 text-xs text-muted-foreground"
                              disabled={isSavingDescription}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={handleSaveDescription}
                              className="h-8 px-3 text-xs"
                              disabled={isSavingDescription}
                            >
                              {isSavingDescription ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Save Changes
                            </Button>
                          </>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Description actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onSelect={() => {
                                void copyTextToClipboard(selectedJob.jobDescription || "");
                                toast.success("Copied raw description");
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy raw text
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground">
                      {isEditingDescription ? (
                        <div className="space-y-3">
                          <Textarea
                            value={editedDescription}
                            onChange={(event) => setEditedDescription(event.target.value)}
                            className="min-h-[400px] font-mono text-sm leading-relaxed focus-visible:ring-1"
                            placeholder="Enter job description..."
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setIsEditingDescription(false);
                                setEditedDescription(selectedJob.jobDescription || "");
                              }}
                              disabled={isSavingDescription}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveDescription}
                              disabled={isSavingDescription}
                            >
                              {isSavingDescription ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                              )}
                              Save Description
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
};

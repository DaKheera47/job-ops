import * as api from "@client/api";
import { JobHeader, TailoredSummary } from "@client/components";
import { GhostwriterDrawer } from "@client/components/ghostwriter/GhostwriterDrawer";
import { JobDescriptionMarkdown } from "@client/components/JobDescriptionMarkdown";
import { JobDetailsEditDrawer } from "@client/components/JobDetailsEditDrawer";
import { KbdHint } from "@client/components/KbdHint";
import { OpenJobListingButton } from "@client/components/OpenJobListingButton";
import { TailoringWorkspace } from "@client/components/tailoring/TailoringWorkspace";
import {
  useMarkAsAppliedMutation,
  useSkipJobMutation,
} from "@client/hooks/queries/useJobMutations";
import { useProfile } from "@client/hooks/useProfile";
import { useRescoreJob } from "@client/hooks/useRescoreJob";
import { useSettings } from "@client/hooks/useSettings";
import { uploadJobPdfFromFile } from "@client/lib/job-pdf-upload";
import { getRenderableJobDescription } from "@client/lib/jobDescription";
import { downloadJobPdf, openJobPdf } from "@client/lib/private-pdf";
import type {
  Job,
  JobListItem,
  ResumeProjectCatalogItem,
} from "@shared/types.js";
import {
  CheckCircle2,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  FileText,
  FolderKanban,
  Loader2,
  MoreHorizontal,
  RefreshCcw,
  Save,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trackProductEvent } from "@/lib/analytics";
import {
  cn,
  copyTextToClipboard,
  formatJobForWebhook,
  safeFilenamePart,
} from "@/lib/utils";
import type { FilterTab } from "./constants";

interface JobDetailPanelProps {
  activeTab: FilterTab;
  activeJobs: JobListItem[];
  selectedJob: Job | null;
  onSelectJobId: (jobId: string | null) => void;
  onJobUpdated: () => Promise<void>;
  onPauseRefreshChange?: (paused: boolean) => void;
}

type InspectorTab = "brief" | "tailoring" | "apply";

const tabCopy: Record<
  InspectorTab,
  {
    label: string;
    description: string;
    dotClassName: string;
    selectedClassName: string;
  }
> = {
  brief: {
    label: "Brief",
    description: "Read the role, fit, and job description.",
    dotClassName: "bg-sky-500/70",
    selectedClassName: "!border-sky-400/65 !bg-sky-500/20 !text-sky-100",
  },
  tailoring: {
    label: "Tailoring",
    description: "Shape the resume material for this job.",
    dotClassName: "bg-amber-500/70",
    selectedClassName: "!border-amber-400/65 !bg-amber-500/20 !text-amber-100",
  },
  apply: {
    label: "Apply",
    description: "Use the generated kit, Ghostwriter, and final actions.",
    dotClassName: "bg-emerald-500/70",
    selectedClassName:
      "!border-emerald-400/65 !bg-emerald-500/20 !text-emerald-100",
  },
};

const statusTone: Record<
  Job["status"],
  {
    shell: string;
    eyebrow: string;
    icon: string;
    button?: string;
  }
> = {
  discovered: {
    shell: "border-border/45 bg-muted/10",
    eyebrow: "text-muted-foreground",
    icon: "bg-sky-500/70",
  },
  processing: {
    shell: "border-border/45 bg-muted/10",
    eyebrow: "text-muted-foreground",
    icon: "bg-amber-500/70",
  },
  ready: {
    shell: "border-border/45 bg-muted/10",
    eyebrow: "text-muted-foreground",
    icon: "bg-emerald-500/70",
    button: "bg-emerald-600 text-white hover:bg-emerald-500",
  },
  applied: {
    shell: "border-border/45 bg-muted/10",
    eyebrow: "text-muted-foreground",
    icon: "bg-teal-500/70",
    button: "bg-teal-600 text-white hover:bg-teal-500",
  },
  in_progress: {
    shell: "border-border/45 bg-muted/10",
    eyebrow: "text-muted-foreground",
    icon: "bg-cyan-500/70",
  },
  skipped: {
    shell: "border-border/45 bg-muted/10",
    eyebrow: "text-muted-foreground",
    icon: "bg-rose-500/70",
  },
  expired: {
    shell: "border-border/45 bg-muted/10",
    eyebrow: "text-muted-foreground",
    icon: "bg-slate-500/70",
  },
};

const getPrimaryAction = (job: Job): string => {
  if (job.status === "processing") return "Processing";
  if (job.status === "ready") return "Mark Applied";
  if (job.status === "discovered") return "Start Tailoring";
  if (job.status === "applied") return "Move to In Progress";
  if (job.status === "in_progress") return "In Progress";
  if (job.status === "skipped") return "Skipped";
  if (job.status === "expired") return "Expired";
  return "Review Job";
};

const getDefaultInspectorTab = (
  job: Job | null,
  activeTab: FilterTab,
): InspectorTab => {
  if (!job) return "brief";
  if (activeTab === "ready" || job.status === "ready") return "apply";
  return "brief";
};

const getJobStageNote = (job: Job): string => {
  if (job.status === "ready") {
    return "Ready to apply. Review the brief, use the application kit, then mark it applied.";
  }
  if (job.status === "discovered") {
    return "Newly discovered. Decide if it is worth tailoring, then generate the application kit.";
  }
  if (job.status === "processing") {
    return "JobOps is analyzing this role and preparing the first draft.";
  }
  if (job.status === "applied") {
    return "Already applied. Keep notes, follow-ups, and status changes here.";
  }
  if (job.status === "in_progress") {
    return "Application is in progress. Use this space to keep the job context close.";
  }
  return "Archived or inactive job. The details remain available for reference.";
};

const Stat: React.FC<{
  label: string;
  value?: string | null;
  tone?: "blue" | "green" | "neutral";
}> = ({ label, value, tone = "neutral" }) => {
  if (!value) return null;
  const toneClassName =
    tone === "blue"
      ? "border-sky-400/10 bg-muted/5"
      : tone === "green"
        ? "border-emerald-400/10 bg-muted/5"
        : "border-border/35 bg-muted/5";
  return (
    <div className={cn("min-w-0 rounded-md border px-3 py-2", toneClassName)}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
        {label}
      </div>
      <div className="mt-1 truncate text-xs font-medium text-foreground/85">
        {value}
      </div>
    </div>
  );
};

const FitSignal: React.FC<{ job: Job }> = ({ job }) => {
  if (!job.suitabilityReason) return null;

  const score = job.suitabilityScore ?? 0;
  const isStrong = score >= 75;
  const isRisk = score > 0 && score < 55;
  const toneClassName = isStrong
    ? "border-emerald-400/20 bg-muted/5"
    : isRisk
      ? "border-rose-400/25 bg-muted/5"
      : "border-amber-400/25 bg-muted/5";
  const label = isStrong ? "Strong fit" : isRisk ? "Fit risk" : "Fit check";
  const iconClassName = isStrong
    ? "text-emerald-300"
    : isRisk
      ? "text-rose-300"
      : "text-amber-300";

  return (
    <div className={cn("rounded-lg border px-3 py-3", toneClassName)}>
      <div
        className={cn(
          "mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide",
          iconClassName,
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {label}
        {job.suitabilityScore != null ? (
          <span className="ml-auto text-[10px] tabular-nums opacity-80">
            {job.suitabilityScore}/100
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-foreground/85">
        {job.suitabilityReason}
      </p>
    </div>
  );
};

const KitStatus: React.FC<{ label: string; ready: boolean }> = ({
  label,
  ready,
}) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-border/35 bg-background/30 px-3 py-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        ready
          ? "bg-emerald-500/10 text-emerald-300"
          : "bg-amber-500/10 text-amber-300",
      )}
    >
      {ready ? "Ready" : "Missing"}
    </span>
  </div>
);

export const JobDetailPanel: React.FC<JobDetailPanelProps> = ({
  activeTab,
  activeJobs,
  selectedJob,
  onSelectJobId,
  onJobUpdated,
  onPauseRefreshChange,
}) => {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("brief");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const uploadPdfInputRef = useRef<HTMLInputElement | null>(null);
  const previousSelectionKeyRef = useRef<string | null>(null);
  const markAsAppliedMutation = useMarkAsAppliedMutation();
  const skipJobMutation = useSkipJobMutation();
  const { isRescoring, rescoreJob } = useRescoreJob(onJobUpdated);
  const { personName } = useProfile();
  const { renderMarkdownInJobDescriptions } = useSettings();

  const jobLink = selectedJob
    ? selectedJob.applicationLink || selectedJob.jobUrl
    : "#";
  const selectedPdfFilename = selectedJob
    ? `${safeFilenamePart(personName || "Unknown")}_${safeFilenamePart(selectedJob.employer || "Unknown")}.pdf`
    : "resume.pdf";
  const description = useMemo(
    () => getRenderableJobDescription(selectedJob?.jobDescription),
    [selectedJob?.jobDescription],
  );
  const selectedProjectIds = useMemo(
    () => selectedJob?.selectedProjectIds?.split(",").filter(Boolean) ?? [],
    [selectedJob?.selectedProjectIds],
  );
  const selectedProjects = useMemo(
    () =>
      selectedProjectIds
        .map((id) => catalog.find((project) => project.id === id)?.name ?? id)
        .filter(Boolean),
    [catalog, selectedProjectIds],
  );

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await api.getResumeProjectsCatalog());
    } catch {
      setCatalog([]);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const currentJobId = selectedJob?.id ?? null;
    const currentSelectionKey = `${activeTab}:${currentJobId ?? ""}`;
    if (previousSelectionKeyRef.current === currentSelectionKey) return;
    previousSelectionKeyRef.current = currentSelectionKey;
    setInspectorTab(getDefaultInspectorTab(selectedJob, activeTab));
    setIsEditingDescription(false);
    setEditedDescription(selectedJob?.jobDescription || "");
    setIsEditDetailsOpen(false);
    onPauseRefreshChange?.(false);
  }, [activeTab, selectedJob, onPauseRefreshChange]);

  useEffect(() => {
    if (!selectedJob || isEditingDescription) return;
    setEditedDescription(selectedJob.jobDescription || "");
  }, [selectedJob, isEditingDescription]);

  useEffect(() => {
    return () => onPauseRefreshChange?.(false);
  }, [onPauseRefreshChange]);

  const handleJobMoved = useCallback(
    (jobId: string) => {
      const currentIndex = activeJobs.findIndex((job) => job.id === jobId);
      const nextJob =
        activeJobs[currentIndex + 1] || activeJobs[currentIndex - 1];
      onSelectJobId(nextJob?.id ?? null);
    },
    [activeJobs, onSelectJobId],
  );

  const handleSaveDescription = useCallback(async () => {
    if (!selectedJob) return;
    try {
      setIsSavingDescription(true);
      await api.updateJob(selectedJob.id, {
        jobDescription: editedDescription,
      });
      toast.success("Job description updated");
      setIsEditingDescription(false);
      await onJobUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update description";
      toast.error(message);
    } finally {
      setIsSavingDescription(false);
    }
  }, [editedDescription, onJobUpdated, selectedJob]);

  const openEditDetails = useCallback(() => {
    window.setTimeout(() => setIsEditDetailsOpen(true), 0);
  }, []);

  const handleCopyInfo = useCallback(async () => {
    if (!selectedJob) return;

    try {
      await copyTextToClipboard(formatJobForWebhook(selectedJob));
      toast.success("Copied job info");
    } catch {
      toast.error("Could not copy job info");
    }
  }, [selectedJob]);

  const handleProcess = useCallback(async () => {
    if (!selectedJob) return;
    try {
      setIsProcessing(true);
      if (selectedJob.status === "ready") {
        await api.generateJobPdf(selectedJob.id);
        toast.success("PDF regenerated");
        trackProductEvent("jobs_job_action_completed", {
          action: "generate_pdf",
          result: "success",
          from_status: selectedJob.status,
        });
      } else {
        await api.processJob(selectedJob.id);
        toast.success("Job moved to Ready", {
          description: "Your tailored PDF has been generated.",
        });
        trackProductEvent("jobs_job_action_completed", {
          action: "process_job",
          result: "success",
          from_status: selectedJob.status,
          to_status: "ready",
        });
        handleJobMoved(selectedJob.id);
      }
      await onJobUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to process job";
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  }, [handleJobMoved, onJobUpdated, selectedJob]);

  const handlePrimaryAction = useCallback(async () => {
    if (!selectedJob) return;
    if (selectedJob.status === "discovered") {
      setInspectorTab("tailoring");
      return;
    }
    if (selectedJob.status === "ready") {
      try {
        setIsApplying(true);
        await markAsAppliedMutation.mutateAsync(selectedJob.id);
        trackProductEvent("jobs_job_action_completed", {
          action: "mark_applied",
          result: "success",
          from_status: selectedJob.status,
          to_status: "applied",
        });
        toast.success("Marked as applied", {
          description: `${selectedJob.title} at ${selectedJob.employer}`,
        });
        handleJobMoved(selectedJob.id);
        await onJobUpdated();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to mark as applied";
        toast.error(message);
      } finally {
        setIsApplying(false);
      }
      return;
    }
    if (selectedJob.status === "applied") {
      try {
        setIsMoving(true);
        await api.updateJob(selectedJob.id, { status: "in_progress" });
        trackProductEvent("jobs_job_action_completed", {
          action: "move_in_progress",
          result: "success",
          from_status: selectedJob.status,
          to_status: "in_progress",
        });
        toast.success("Moved to in progress");
        await onJobUpdated();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to move to in progress";
        toast.error(message);
      } finally {
        setIsMoving(false);
      }
      return;
    }
    setInspectorTab("brief");
  }, [handleJobMoved, markAsAppliedMutation, onJobUpdated, selectedJob]);

  const handleSkip = useCallback(async () => {
    if (!selectedJob) return;
    try {
      await skipJobMutation.mutateAsync(selectedJob.id);
      trackProductEvent("jobs_job_action_completed", {
        action: "skip",
        result: "success",
        from_status: selectedJob.status,
        to_status: "skipped",
      });
      toast.message("Job skipped");
      handleJobMoved(selectedJob.id);
      await onJobUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to skip";
      toast.error(message);
    }
  }, [handleJobMoved, onJobUpdated, selectedJob, skipJobMutation]);

  const handleOpenPdf = useCallback(() => {
    if (!selectedJob) return;
    void openJobPdf(selectedJob.id).catch((error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not open PDF",
      );
    });
  }, [selectedJob]);

  const handleDownloadPdf = useCallback(() => {
    if (!selectedJob) return;
    void downloadJobPdf(selectedJob.id, selectedPdfFilename).catch((error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not download PDF",
      );
    });
  }, [selectedJob, selectedPdfFilename]);

  const handleUploadPdf = useCallback(
    async (file: File) => {
      if (!selectedJob) return;
      try {
        setIsUploadingPdf(true);
        await uploadJobPdfFromFile(selectedJob.id, file);
        toast.success(selectedJob.pdfPath ? "PDF replaced" : "PDF attached");
        await onJobUpdated();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload PDF";
        toast.error(message);
      } finally {
        setIsUploadingPdf(false);
        if (uploadPdfInputRef.current) {
          uploadPdfInputRef.current.value = "";
        }
      }
    },
    [onJobUpdated, selectedJob],
  );

  if (!selectedJob) {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border/50 bg-muted/20">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium text-muted-foreground">
          No job selected
        </div>
        <p className="max-w-[220px] text-xs text-muted-foreground/70">
          Select a job to see the brief, tailoring, and application kit.
        </p>
      </div>
    );
  }

  const primaryBusy =
    isProcessing ||
    isApplying ||
    isMoving ||
    selectedJob.status === "processing";
  const canGenerate = ["discovered", "ready"].includes(selectedJob.status);
  const canSkip = ["discovered", "ready"].includes(selectedJob.status);
  const tone = statusTone[selectedJob.status];

  return (
    <div className="flex min-h-[520px] flex-col gap-4">
      <div className="space-y-4">
        <JobHeader
          job={selectedJob}
          onCheckSponsor={async () => {
            await api.checkSponsor(selectedJob.id);
            await onJobUpdated();
          }}
        />

        <div
          className={cn(
            "relative overflow-hidden rounded-lg border p-3",
            tone.shell,
          )}
        >
          <div className={cn("absolute inset-y-0 left-0 w-1", tone.icon)} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  tone.eyebrow,
                )}
              >
                Next step
              </div>
              <p className="mt-1 text-xs text-foreground/80">
                {getJobStageNote(selectedJob)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={() => void handlePrimaryAction()}
                disabled={primaryBusy || selectedJob.status === "processing"}
                className={cn("h-9 gap-1.5 px-3 text-xs", tone.button)}
              >
                {primaryBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : selectedJob.status === "discovered" ? (
                  <Sparkles className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {getPrimaryAction(selectedJob)}
                {selectedJob.status === "ready" ? (
                  <KbdHint shortcut="a" className="ml-1" />
                ) : null}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={openEditDetails}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setInspectorTab("brief");
                      setIsEditingDescription(true);
                    }}
                  >
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit job description
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void handleCopyInfo()}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy job info
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => rescoreJob(selectedJob.id)}
                    disabled={isRescoring}
                  >
                    <RefreshCcw
                      className={cn(
                        "mr-2 h-4 w-4",
                        isRescoring && "animate-spin",
                      )}
                    />
                    {isRescoring ? "Recalculating..." : "Recalculate match"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {canGenerate && (
                    <DropdownMenuItem
                      onSelect={() => void handleProcess()}
                      disabled={isProcessing}
                    >
                      <RefreshCcw
                        className={cn(
                          "mr-2 h-4 w-4",
                          isProcessing && "animate-spin",
                        )}
                      />
                      {selectedJob.status === "ready"
                        ? "Regenerate PDF"
                        : "Generate PDF"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => uploadPdfInputRef.current?.click()}
                    disabled={isUploadingPdf}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {isUploadingPdf
                      ? "Uploading PDF..."
                      : selectedJob.pdfPath
                        ? "Replace PDF"
                        : "Upload PDF"}
                  </DropdownMenuItem>
                  {selectedJob.pdfPath && (
                    <>
                      <DropdownMenuItem onSelect={handleOpenPdf}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={handleDownloadPdf}>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </DropdownMenuItem>
                    </>
                  )}
                  {canSkip && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => void handleSkip()}
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
          </div>
        </div>
      </div>

      <Tabs
        value={inspectorTab}
        onValueChange={(value) => setInspectorTab(value as InspectorTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TooltipProvider delayDuration={0}>
          <TabsList className="grid h-auto grid-cols-3 gap-1 rounded-lg border border-border/35 bg-background/30 p-1 text-xs">
            {Object.entries(tabCopy).map(([value, copy]) => {
              const isSelected = inspectorTab === value;
              const trigger = (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    "h-9 gap-2 border border-transparent text-xs text-muted-foreground data-[state=active]:shadow-none",
                    isSelected && copy.selectedClassName,
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      copy.dotClassName,
                    )}
                  />
                  <span>{copy.label}</span>
                </TabsTrigger>
              );

              return (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                  <TooltipContent className="max-w-xs text-center">
                    <p>{copy.description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TabsList>
        </TooltipProvider>

        <div className="mt-2 border-l border-border/50 pl-2 text-[10px] text-muted-foreground/65">
          {tabCopy[inspectorTab].description}
        </div>

        <TabsContent value="brief" className="min-h-0 flex-1 space-y-4 pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Stat label="Location" value={selectedJob.location} tone="blue" />
            <Stat label="Salary" value={selectedJob.salary} tone="green" />
            <Stat label="Level" value={selectedJob.jobLevel} />
            <Stat label="Function" value={selectedJob.jobFunction} />
            <Stat label="Type" value={selectedJob.jobType} />
            <Stat label="Discipline" value={selectedJob.disciplines} />
          </div>

          <FitSignal job={selectedJob} />
          <TailoredSummary job={selectedJob} />

          <div className="overflow-hidden rounded-lg border border-border/45 bg-muted/5">
            <div className="flex items-center justify-between gap-2 border-b border-border/35 bg-muted/5 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground/90">
                  <FileText className="h-3.5 w-3.5 text-sky-400/80" />
                  Job description
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground/65">
                  The source material for deciding, tailoring, and applying.
                </p>
              </div>
              <div className="flex gap-1">
                {!isEditingDescription ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        void copyTextToClipboard(
                          selectedJob.jobDescription || "",
                        );
                        toast.success("Copied job description");
                      }}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setIsEditingDescription(true)}
                    >
                      <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
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
                      variant="secondary"
                      className="h-8 px-2 text-xs"
                      onClick={() => void handleSaveDescription()}
                      disabled={isSavingDescription}
                    >
                      {isSavingDescription ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto bg-background/20 p-4 text-sm text-foreground/75">
              {isEditingDescription ? (
                <Textarea
                  value={editedDescription}
                  onChange={(event) => setEditedDescription(event.target.value)}
                  className="min-h-[360px] bg-background/70 font-mono text-sm leading-relaxed focus-visible:ring-1"
                  placeholder="Enter job description..."
                />
              ) : renderMarkdownInJobDescriptions ? (
                <JobDescriptionMarkdown description={description} />
              ) : (
                <div className="whitespace-pre-wrap leading-7">
                  {description}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="tailoring"
          className="min-h-0 flex-1 space-y-4 pt-3"
        >
          <TailoringWorkspace
            mode="editor"
            job={selectedJob}
            onUpdate={onJobUpdated}
            onDirtyChange={onPauseRefreshChange}
          />
        </TabsContent>

        <TabsContent value="apply" className="min-h-0 flex-1 space-y-4 pt-3">
          <div className="space-y-3 pb-1">
            <div>
              <h3 className="text-sm font-semibold text-foreground/85">
                Application kit
              </h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                Open, write, and use the generated materials for this job.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <GhostwriterDrawer
                job={selectedJob}
                triggerClassName="h-10 w-full justify-center gap-1.5 px-2 text-xs"
              />
              <OpenJobListingButton
                href={jobLink}
                className="h-10 w-full px-2 text-xs"
                shortcut="o"
              />
              <Button
                variant="outline"
                className="h-10 w-full gap-1.5 px-2 text-xs"
                onClick={handleDownloadPdf}
                disabled={!selectedJob.pdfPath}
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF
                <KbdHint shortcut="d" className="ml-auto" />
              </Button>
              <Button
                variant="outline"
                className="h-10 w-full gap-1.5 px-2 text-xs"
                onClick={handleOpenPdf}
                disabled={!selectedJob.pdfPath}
              >
                <FileText className="h-3.5 w-3.5" />
                View PDF
              </Button>
              {canGenerate && (
                <Button
                  variant="outline"
                  className="h-10 w-full gap-1.5 px-2 text-xs"
                  onClick={() => void handleProcess()}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                  {selectedJob.status === "ready"
                    ? "Regenerate PDF"
                    : "Generate PDF"}
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border/45 bg-muted/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground/90">
              <FolderKanban className="h-3.5 w-3.5 text-amber-400/80" />
              Selected projects
            </div>
            {selectedProjects.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedProjects.map((project) => (
                  <span
                    key={project}
                    className="rounded-md border border-border/35 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    {project}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/70">
                No projects selected yet. Use Tailoring to choose the evidence
                for this role.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border/45 bg-muted/5 p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground/90">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
              Application kit
            </div>
            <div className="space-y-2">
              <KitStatus
                label="Tailored summary"
                ready={Boolean(selectedJob.tailoredSummary)}
              />
              <KitStatus
                label="Tailored skills"
                ready={Boolean(selectedJob.tailoredSkills)}
              />
              <KitStatus label="PDF" ready={Boolean(selectedJob.pdfPath)} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <JobDetailsEditDrawer
        open={isEditDetailsOpen}
        onOpenChange={setIsEditDetailsOpen}
        job={selectedJob}
        onJobUpdated={onJobUpdated}
      />

      <input
        ref={uploadPdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            void handleUploadPdf(file);
          }
        }}
      />
    </div>
  );
};

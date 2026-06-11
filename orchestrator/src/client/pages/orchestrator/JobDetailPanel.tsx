import * as api from "@client/api";
import {
  JobBriefPane,
  JobDescriptionPanel,
  JobHeader,
} from "@client/components";
import { GhostwriterDrawer } from "@client/components/ghostwriter/GhostwriterDrawer";
import { JobDetailsEditDrawer } from "@client/components/JobDetailsEditDrawer";
import { KbdHint } from "@client/components/KbdHint";
import { OpenJobListingButton } from "@client/components/OpenJobListingButton";
import { TooltipWhenDisabled } from "@client/components/TooltipWhenDisabled";
import { TailoringWorkspace } from "@client/components/tailoring/TailoringWorkspace";
import {
  useMarkAsAppliedMutation,
  useSkipJobMutation,
} from "@client/hooks/queries/useJobMutations";
import { useProfile } from "@client/hooks/useProfile";
import { useRescoreJob } from "@client/hooks/useRescoreJob";
import { useSettings } from "@client/hooks/useSettings";
import { uploadJobPdfFromFile } from "@client/lib/job-pdf-upload";
import { resolveFilenameLanguage } from "@client/lib/pdf-filename";
import {
  getPdfActionLabels,
  isPdfRegenerating,
  isPdfStale,
  PDF_REGENERATING_MESSAGE,
  STALE_PDF_MESSAGE,
} from "@client/lib/pdf-freshness";
import { downloadJobPdf, openJobPdf } from "@client/lib/private-pdf";
import type {
  Job,
  JobListItem,
  ResumeProjectCatalogItem,
} from "@shared/types.js";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  FileText,
  FolderKanban,
  Link2,
  Loader2,
  MoreHorizontal,
  RefreshCcw,
  Sparkles,
  Star,
  Upload,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { parseJobBrief } from "@/client/components/JobBriefPane";
import { showErrorToast } from "@/client/lib/error-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const KitStatus: React.FC<{
  icon: React.ReactNode;
  label: string;
  ready: boolean;
  readyLabel?: string;
  optional?: boolean;
}> = ({ icon, label, ready, readyLabel = "Ready", optional = false }) => (
  <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/30 px-3 py-2.5 last:border-b-0">
    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <span className="text-muted-foreground/85">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
        ready
          ? "bg-emerald-500/10 text-emerald-300"
          : optional
            ? "bg-sky-500/10 text-sky-300"
            : "bg-amber-500/10 text-amber-300",
      )}
    >
      {ready ? readyLabel : optional ? "Optional" : "Missing"}
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [openedListingJobIds, setOpenedListingJobIds] = useState<Set<string>>(
    () => new Set(),
  );
  const uploadPdfInputRef = useRef<HTMLInputElement | null>(null);
  const previousSelectionKeyRef = useRef<string | null>(null);
  const markAsAppliedMutation = useMarkAsAppliedMutation();
  const skipJobMutation = useSkipJobMutation();
  const { isRescoring, rescoreJob } = useRescoreJob(onJobUpdated);
  const { settings } = useSettings();
  const { personName, profile } = useProfile();
  const filenameLanguage = resolveFilenameLanguage({ settings, profile });

  const jobLink = selectedJob
    ? selectedJob.applicationLink || selectedJob.jobUrl
    : "#";
  const selectedPdfFilename = selectedJob
    ? `${safeFilenamePart(personName || "Unknown", {
        language: filenameLanguage,
      })}_${safeFilenamePart(selectedJob.employer || "Unknown", {
        language: filenameLanguage,
      })}.pdf`
    : "resume.pdf";
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
  const hasTailoredSummary = Boolean(selectedJob?.tailoredSummary);
  const hasTailoredSkills = Boolean(selectedJob?.tailoredSkills);
  const hasResumePdf = Boolean(selectedJob?.pdfPath);
  const hasJobListing = Boolean(jobLink && jobLink !== "#");
  const hasOpenedJobListing = selectedJob
    ? openedListingJobIds.has(selectedJob.id)
    : false;
  const applicationKitReady =
    hasTailoredSummary && hasTailoredSkills && hasResumePdf;
  const brief = parseJobBrief(selectedJob?.jobBrief || null);

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
    setIsEditDetailsOpen(false);
    onPauseRefreshChange?.(false);
  }, [activeTab, selectedJob, onPauseRefreshChange]);

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

  const handleSaveDescription = useCallback(
    async (jobDescription: string) => {
      if (!selectedJob) return;
      await api.updateJob(selectedJob.id, { jobDescription });
      await onJobUpdated();
    },
    [onJobUpdated, selectedJob],
  );

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
      showErrorToast(error, "Failed to process job");
    } finally {
      setIsProcessing(false);
    }
  }, [handleJobMoved, onJobUpdated, selectedJob]);

  const handleMarkApplied = useCallback(async () => {
    if (!selectedJob || selectedJob.status !== "ready") return;
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
      showErrorToast(error, "Failed to mark as applied");
    } finally {
      setIsApplying(false);
    }
  }, [handleJobMoved, markAsAppliedMutation, onJobUpdated, selectedJob]);

  const handlePrimaryAction = useCallback(async () => {
    if (!selectedJob) return;
    if (selectedJob.status === "discovered") {
      setInspectorTab("tailoring");
      return;
    }
    if (selectedJob.status === "ready") {
      await handleMarkApplied();
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
        showErrorToast(error, "Failed to move to in progress");
      } finally {
        setIsMoving(false);
      }
      return;
    }
    setInspectorTab("brief");
  }, [handleMarkApplied, onJobUpdated, selectedJob]);

  const handleJobListingOpened = useCallback(() => {
    if (!selectedJob) return;
    setOpenedListingJobIds((current) => {
      const next = new Set(current);
      next.add(selectedJob.id);
      return next;
    });
  }, [selectedJob]);

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
      showErrorToast(error, "Failed to skip");
    }
  }, [handleJobMoved, onJobUpdated, selectedJob, skipJobMutation]);

  const handleOpenPdf = useCallback(() => {
    if (!selectedJob || !selectedJob.pdfPath || isPdfRegenerating(selectedJob))
      return;
    void openJobPdf(selectedJob.id).catch((error) => {
      showErrorToast(error, "Could not open PDF");
    });
  }, [selectedJob]);

  const handleDownloadPdf = useCallback(() => {
    if (!selectedJob || !selectedJob.pdfPath || isPdfRegenerating(selectedJob))
      return;
    void downloadJobPdf(selectedJob.id, selectedPdfFilename).catch((error) => {
      showErrorToast(error, "Could not download PDF");
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
        showErrorToast(error, "Failed to upload PDF");
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
      <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
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
  const isRegeneratingPdf = isPdfRegenerating(selectedJob);
  const isStalePdf = isPdfStale(selectedJob);
  const pdfLabels = getPdfActionLabels(selectedJob);
  const pdfRegeneratingReason = isRegeneratingPdf
    ? PDF_REGENERATING_MESSAGE
    : null;
  const pdfActionDisabled = !selectedJob.pdfPath || isRegeneratingPdf;
  const tone = statusTone[selectedJob.status];
  const openListingIsPrimary =
    selectedJob.status === "ready" && hasJobListing && !hasOpenedJobListing;
  const markAppliedIsPrimary =
    selectedJob.status === "ready" && (!hasJobListing || hasOpenedJobListing);
  const activeApplyCtaClassName =
    "border-emerald-500/40 bg-emerald-600 text-white hover:bg-emerald-500 hover:text-white";
  return (
    <Tabs
      value={inspectorTab}
      onValueChange={(value) => setInspectorTab(value as InspectorTab)}
      className="flex min-h-0 min-w-0 flex-1 flex-col lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto p-1"
    >
      <TooltipProvider delayDuration={0}>
        <TabsList className="grid h-auto grid-cols-3 gap-1 rounded-lg text-sm bg-muted/90 mb-4">
          {Object.entries(tabCopy).map(([value, copy]) => {
            const isSelected = inspectorTab === value;
            const trigger = (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  "flex-1 flex items-center lg:flex-none gap-1.5",
                  isSelected && copy.selectedClassName,
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", copy.dotClassName)}
                />
                <span className="text-sm">{copy.label}</span>
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
      <JobHeader
        job={selectedJob}
        onCheckSponsor={async () => {
          await api.checkSponsor(selectedJob.id);
          await onJobUpdated();
        }}
        jobCTA={
          <div className="flex shrink-0 gap-2">
            <GhostwriterDrawer
              job={selectedJob}
              triggerLabel="Ask Ghostwriter"
              triggerVariant="ghost"
            />
            <Button
              size="sm"
              onClick={() => void handlePrimaryAction()}
              disabled={primaryBusy || selectedJob.status === "processing"}
              className={cn(tone.button)}
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
                <Button size="icon" variant="ghost" aria-label="More actions">
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
                  }}
                >
                  <Edit2 className="mr-2 h-4 w-4" />
                  View job description
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
                    <DropdownMenuItem
                      onSelect={handleOpenPdf}
                      disabled={pdfActionDisabled}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {pdfLabels.view}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={handleDownloadPdf}
                      disabled={pdfActionDisabled}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {pdfLabels.download}
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
        }
      />

      <div className="flex min-w-0 flex-col rounded-lg rounded-t-none border border-t-0 border-border/50 bg-card p-4">
        <TabsContent value="brief" className="space-y-4">
          {!brief && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Stat label="Location" value={selectedJob.location} tone="blue" />
              <Stat label="Salary" value={selectedJob.salary} tone="green" />
              <Stat label="Level" value={selectedJob.jobLevel} />
              <Stat label="Function" value={selectedJob.jobFunction} />
              <Stat label="Type" value={selectedJob.jobType} />
              <Stat label="Discipline" value={selectedJob.disciplines} />
            </div>
          )}

          <JobBriefPane job={selectedJob} />
          <JobDescriptionPanel
            description={selectedJob.jobDescription}
            jobUrl={selectedJob.jobUrl}
            onSave={handleSaveDescription}
          />
        </TabsContent>

        <TabsContent value="tailoring">
          <TailoringWorkspace
            mode="editor"
            job={selectedJob}
            onUpdate={onJobUpdated}
            onDirtyChange={onPauseRefreshChange}
          />
        </TabsContent>

        <TabsContent value="apply">
          <div className="space-y-5">
            {isStalePdf && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{STALE_PDF_MESSAGE}</span>
              </div>
            )}

            <div className="space-y-4">
              <div
                className={cn(
                  "flex min-h-16 items-center justify-between gap-3 rounded-md border px-3 py-3",
                  applicationKitReady
                    ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                    : "border-amber-500/20 bg-amber-500/[0.04]",
                )}
              >
                <div className="flex min-w-0 items-center w-full justify-between">
                  <div className="flex gap-3">
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                        applicationKitReady
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-500/45 bg-amber-500/10 text-amber-300",
                      )}
                    >
                      {applicationKitReady ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <CircleAlert className="h-4 w-4" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground/90">
                        {applicationKitReady
                          ? "Application materials ready"
                          : "Application materials need review"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground/75">
                        {applicationKitReady
                          ? "Tailored summary, skills, and PDF are ready for this role."
                          : "Check the application kit before submitting this role."}
                      </p>
                    </div>
                  </div>

                  <Button asChild variant="outline">
                    <a href={`/job/${selectedJob.id}`}>
                      Open Job Page
                      <ArrowRight />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <TooltipWhenDisabled
                reason={pdfRegeneratingReason}
                className="w-full"
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={pdfActionDisabled}
                >
                  <Download className="size-3.5" />
                  {pdfLabels.download}
                  <KbdHint shortcut="d" className="ml-auto" />
                </Button>
              </TooltipWhenDisabled>
              <OpenJobListingButton
                href={jobLink}
                size="sm"
                className={cn(openListingIsPrimary && activeApplyCtaClassName)}
                shortcut="o"
                disabled={!hasJobListing}
                onClick={handleJobListingOpened}
              />
              <Button
                variant={markAppliedIsPrimary ? "default" : "outline"}
                className={cn(markAppliedIsPrimary && activeApplyCtaClassName)}
                size="sm"
                onClick={() => void handleMarkApplied()}
                disabled={selectedJob.status !== "ready" || primaryBusy}
              >
                {isApplying ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                Mark Applied
                <KbdHint shortcut="a" className="ml-auto" />
              </Button>
            </div>

            <div>
              <div className="mb-2 text-lg font-semibold tracking-normal text-foreground/90">
                Application kit
              </div>
              <div className="overflow-hidden rounded-md border border-border/45 bg-muted/5">
                <KitStatus
                  icon={<FileText className="h-4 w-4" />}
                  label="Tailored summary"
                  ready={hasTailoredSummary}
                />
                <KitStatus
                  icon={<Star className="h-4 w-4" />}
                  label="Tailored skills"
                  ready={hasTailoredSkills}
                />
                <KitStatus
                  icon={<FileText className="h-4 w-4" />}
                  label="Resume PDF"
                  ready={hasResumePdf}
                />
                <KitStatus
                  icon={<FolderKanban className="h-4 w-4" />}
                  label="Selected projects"
                  ready={selectedProjectIds.length > 0}
                  readyLabel={`${selectedProjectIds.length} included`}
                />
                <KitStatus
                  icon={<Link2 className="h-4 w-4" />}
                  label="Supporting links"
                  ready={false}
                  optional
                />
              </div>
            </div>

            <div>
              <div className="mb-2 text-lg font-semibold tracking-normal text-foreground/90">
                Selected projects
              </div>
              {selectedProjects.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedProjects.map((project) => (
                    <span
                      key={project}
                      className="rounded-md border border-border/35 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground"
                    >
                      {project}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/70">
                  No projects selected yet. Use Tailoring to choose the evidence
                  for this role.
                </p>
              )}
            </div>
          </div>
        </TabsContent>

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
    </Tabs>
  );
};

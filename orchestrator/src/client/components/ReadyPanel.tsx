import { showErrorToast } from "@/client/lib/error-toast";
/**
 * ReadyPanel - Optimized "shipping lane" view for Ready jobs.
 *
 * Designed for a single, fast, repeatable workflow: verify → download → apply → mark applied.
 * The PDF is the primary artifact, represented abstractly through an Application Kit summary.
 *
 * Now includes inline tailoring mode for editing and regenerating PDFs without switching tabs.
 */

import type { Job, ResumeProjectCatalogItem } from "@shared/types.js";
import {
  CheckCircle2,
  ChevronUp,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  FileText,
  FolderKanban,
  Loader2,
  RefreshCcw,
  Undo2,
  Upload,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadJobPdfFromFile } from "@/client/lib/job-pdf-upload";
import { downloadJobPdf, openJobPdf } from "@/client/lib/private-pdf";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trackProductEvent } from "@/lib/analytics";
import {
  cn,
  copyTextToClipboard,
  formatJobForWebhook,
  safeFilenamePart,
} from "@/lib/utils";
import * as api from "../api";
import {
  useMarkAsAppliedMutation,
  useSkipJobMutation,
} from "../hooks/queries/useJobMutations";
import { useProfile } from "../hooks/useProfile";
import { useRescoreJob } from "../hooks/useRescoreJob";
import { FitAssessment, JobHeader, TailoredSummary } from ".";
import { TailorMode } from "./discovered-panel/TailorMode";
import { GhostwriterDrawer } from "./ghostwriter/GhostwriterDrawer";
import { JobDetailsEditDrawer } from "./JobDetailsEditDrawer";
import { KbdHint } from "./KbdHint";
import { OpenJobListingButton } from "./OpenJobListingButton";
import { ReadySummaryAccordion } from "./ReadySummaryAccordion";
import { buildReadyPanelGoogleDorks } from "./ready-panel-google-dorks";

type PanelMode = "ready" | "tailor";

interface ReadyPanelProps {
  job: Job | null;
  onJobUpdated: () => void | Promise<void>;
  onJobMoved: (jobId: string) => void;
  onTailoringDirtyChange?: (isDirty: boolean) => void;
}

export const ReadyPanel: React.FC<ReadyPanelProps> = ({
  job,
  onJobUpdated,
  onJobMoved,
  onTailoringDirtyChange,
}) => {
  const [mode, setMode] = useState<PanelMode>("ready");
  const [isMarkingApplied, setIsMarkingApplied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false);
  const { isRescoring, rescoreJob } = useRescoreJob(onJobUpdated);
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [recentlyApplied, setRecentlyApplied] = useState<{
    jobId: string;
    jobTitle: string;
    employer: string;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const previousJobIdRef = useRef<string | null>(null);
  const uploadPdfInputRef = useRef<HTMLInputElement | null>(null);
  const markAsAppliedMutation = useMarkAsAppliedMutation();
  const skipJobMutation = useSkipJobMutation();

  const { personName } = useProfile();
  const openEditDetails = useCallback(() => {
    window.setTimeout(() => setIsEditDetailsOpen(true), 0);
  }, []);

  const loadCatalog = useCallback(async (silently = false) => {
    try {
      const nextCatalog = await api.getResumeProjectsCatalog();
      setCatalog(nextCatalog);
    } catch (error) {
      if (!silently) {
        console.error(error);
      }
    }
  }, []);

  // Load and refresh project catalog
  useEffect(() => {
    void loadCatalog(false);

    const refreshCatalog = () => {
      void loadCatalog(true);
    };

    window.addEventListener("focus", refreshCatalog);
    document.addEventListener("visibilitychange", refreshCatalog);
    return () => {
      window.removeEventListener("focus", refreshCatalog);
      document.removeEventListener("visibilitychange", refreshCatalog);
    };
  }, [loadCatalog]);

  // Reset mode when job changes
  useEffect(() => {
    const currentJobId = job?.id ?? null;
    if (previousJobIdRef.current === currentJobId) return;
    previousJobIdRef.current = currentJobId;
    setMode("ready");
    setIsEditDetailsOpen(false);
    onTailoringDirtyChange?.(false);
  }, [job?.id, onTailoringDirtyChange]);

  useEffect(() => {
    if (mode !== "tailor") {
      onTailoringDirtyChange?.(false);
    }
  }, [mode, onTailoringDirtyChange]);

  useEffect(() => {
    return () => onTailoringDirtyChange?.(false);
  }, [onTailoringDirtyChange]);

  // Compute derived values
  const jobLink = job ? job.applicationLink || job.jobUrl : "#";

  const selectedProjectIds = useMemo(() => {
    return job?.selectedProjectIds?.split(",").filter(Boolean) ?? [];
  }, [job?.selectedProjectIds]);
  const googleDorks = useMemo(
    () => (job ? buildReadyPanelGoogleDorks(job) : []),
    [job],
  );
  const pdfFilename = `${safeFilenamePart(personName || "Unknown")}_${safeFilenamePart(job?.employer || "Unknown")}.pdf`;

  const handleOpenPdf = useCallback(() => {
    if (!job) return;
    void openJobPdf(job.id).catch((error) => {
      showErrorToast(error, "Could not open PDF");
    });
  }, [job]);

  const handleDownloadPdf = useCallback(() => {
    if (!job) return;
    void downloadJobPdf(job.id, pdfFilename).catch((error) => {
      showErrorToast(error, "Could not download PDF");
    });
  }, [job, pdfFilename]);

  const handleUndoApplied = useCallback(
    async (jobId: string) => {
      try {
        // Revert to ready status
        await api.updateJob(jobId, { status: "ready" });
        trackProductEvent("jobs_job_action_completed", {
          action: "move_to_ready",
          result: "success",
          from_status: "applied",
          to_status: "ready",
        });
        toast.success("Reverted to Ready");

        if (recentlyApplied?.timeoutId) {
          clearTimeout(recentlyApplied.timeoutId);
        }
        setRecentlyApplied(null);
        await onJobUpdated();
      } catch (error) {
        trackProductEvent("jobs_job_action_completed", {
          action: "move_to_ready",
          result: "error",
          from_status: "applied",
          to_status: "ready",
        });
        showErrorToast(error, "Failed to undo");
      }
    },
    [onJobUpdated, recentlyApplied],
  );

  // Handle mark as applied with undo capability
  const handleMarkApplied = useCallback(async () => {
    if (!job) return;

    try {
      setIsMarkingApplied(true);
      await markAsAppliedMutation.mutateAsync(job.id);
      trackProductEvent("jobs_job_action_completed", {
        action: "mark_applied",
        result: "success",
        from_status: job.status,
        to_status: "applied",
      });

      // Store for undo
      const timeoutId = setTimeout(() => {
        setRecentlyApplied(null);
      }, 8000);

      setRecentlyApplied({
        jobId: job.id,
        jobTitle: job.title,
        employer: job.employer,
        timeoutId,
      });

      // Notify parent to move to next job
      onJobMoved(job.id);
      await onJobUpdated();

      toast.success("Marked as applied", {
        description: `${job.title} at ${job.employer}`,
        action: {
          label: "Undo",
          onClick: () => handleUndoApplied(job.id),
        },
        duration: 6000,
      });
    } catch (error) {
      trackProductEvent("jobs_job_action_completed", {
        action: "mark_applied",
        result: "error",
        from_status: job.status,
        to_status: "applied",
      });
      showErrorToast(error, "Failed to mark as applied");
    } finally {
      setIsMarkingApplied(false);
    }
  }, [job, markAsAppliedMutation, onJobMoved, onJobUpdated, handleUndoApplied]);

  const handleRegenerate = useCallback(async () => {
    if (!job) return;

    try {
      setIsRegenerating(true);
      await api.generateJobPdf(job.id);
      trackProductEvent("jobs_job_action_completed", {
        action: "generate_pdf",
        result: "success",
        from_status: job.status,
      });
      toast.success("PDF regenerated");
      await onJobUpdated();
    } catch (error) {
      trackProductEvent("jobs_job_action_completed", {
        action: "generate_pdf",
        result: "error",
        from_status: job.status,
      });
      showErrorToast(error, "Failed to regenerate PDF");
    } finally {
      setIsRegenerating(false);
    }
  }, [job, onJobUpdated]);

  const handleRescore = useCallback(
    () => rescoreJob(job?.id),
    [job?.id, rescoreJob],
  );

  const handleSkip = useCallback(async () => {
    if (!job) return;

    try {
      await skipJobMutation.mutateAsync(job.id);
      trackProductEvent("jobs_job_action_completed", {
        action: "skip",
        result: "success",
        from_status: job.status,
        to_status: "skipped",
      });
      toast.message("Job skipped");
      onJobMoved(job.id);
      await onJobUpdated();
    } catch (error) {
      trackProductEvent("jobs_job_action_completed", {
        action: "skip",
        result: "error",
        from_status: job.status,
        to_status: "skipped",
      });
      showErrorToast(error, "Failed to skip");
    }
  }, [job, onJobMoved, onJobUpdated, skipJobMutation]);

  const handleCopyInfo = useCallback(async () => {
    if (!job) return;

    try {
      await copyTextToClipboard(formatJobForWebhook(job));
      toast.success("Copied job info", {
        description: "Webhook payload copied to clipboard.",
      });
    } catch {
      toast.error("Could not copy job info");
    }
  }, [job]);

  const handleUploadPdf = useCallback(
    async (file: File) => {
      if (!job) return;

      try {
        setIsUploadingPdf(true);
        await uploadJobPdfFromFile(job.id, file);
        toast.success(job.pdfPath ? "PDF replaced" : "PDF attached");
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
    [job, onJobUpdated],
  );

  // Handler for regenerating PDF after tailoring edits
  const handleTailorFinalize = useCallback(async () => {
    if (!job) return;
    try {
      setIsRegenerating(true);
      await api.generateJobPdf(job.id);
      trackProductEvent("jobs_job_action_completed", {
        action: "generate_pdf",
        result: "success",
        from_status: job.status,
      });
      toast.success("PDF regenerated");
      await onJobUpdated();
      setMode("ready");
    } catch (error) {
      trackProductEvent("jobs_job_action_completed", {
        action: "generate_pdf",
        result: "error",
        from_status: job.status,
      });
      showErrorToast(error, "Failed to regenerate PDF");
    } finally {
      setIsRegenerating(false);
    }
  }, [job, onJobUpdated]);

  // Empty state
  if (!job) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="text-sm font-medium text-muted-foreground">
          No job selected
        </div>
        <p className="text-xs text-muted-foreground/70 max-w-[200px]">
          Select a Ready job to view its application kit and take action.
        </p>
      </div>
    );
  }

  // Tailor mode - reuse the same TailorMode component with 'ready' variant
  if (mode === "tailor") {
    return (
      <TailorMode
        job={job}
        onBack={() => setMode("ready")}
        onFinalize={handleTailorFinalize}
        isFinalizing={isRegenerating}
        variant="ready"
        onDirtyChange={onTailoringDirtyChange}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <JobHeader
        job={job}
        className="pb-4 border-b border-border/40"
        onCheckSponsor={async () => {
          try {
            await api.checkSponsor(job.id);
            trackProductEvent("jobs_job_action_completed", {
              action: "check_sponsor",
              result: "success",
              from_status: job.status,
            });
            await onJobUpdated();
          } catch (error) {
            trackProductEvent("jobs_job_action_completed", {
              action: "check_sponsor",
              result: "error",
              from_status: job.status,
            });
            throw error;
          }
        }}
      />

      {/* ─────────────────────────────────────────────────────────────────────
          PRIMARY ACTION CLUSTER
          All actions in one line: View, Save, Open, and Mark Applied
      ───────────────────────────────────────────────────────────────────── */}
      <div className="pb-4 border-b border-border/40">
        <div className="grid gap-2 sm:grid-cols-2">
          <GhostwriterDrawer
            job={job}
            triggerClassName="h-9 w-full justify-center gap-1 px-2 text-xs"
          />

          {/* Download PDF - primary artifact action */}
          <Button
            variant="outline"
            className="h-9 w-full gap-1 px-2 text-xs"
            onClick={handleDownloadPdf}
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Download PDF</span>
            <KbdHint shortcut="d" className="ml-auto" />
          </Button>

          {/* Open job - to verify before applying */}
          <OpenJobListingButton
            href={jobLink}
            className="h-9 w-full px-2 text-xs"
            shortcut="o"
          />

          {/* Primary CTA: Mark Applied */}
          <Button
            onClick={handleMarkApplied}
            variant="default"
            className="h-9 w-full gap-1 px-2 text-xs"
            disabled={isMarkingApplied}
          >
            {isMarkingApplied ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            <span className="truncate">Mark Applied</span>
            <KbdHint shortcut="a" className="ml-auto" />
          </Button>
        </div>
      </div>

      <div className="flex-1 py-4 space-y-4">
        <div className="space-y-3">
          <FitAssessment job={job} />
          <TailoredSummary job={job} />

          {googleDorks.length > 0 ? (
            <ReadySummaryAccordion
              icon={ExternalLink}
              summary={
                <>
                  {googleDorks.length}{" "}
                  {googleDorks.length === 1 ? "search link" : "search links"}
                </>
              }
              value="search-dorks"
            >
              <div className="text-muted-foreground flex flex-col items-start gap-2">
                {googleDorks.map((dork) => (
                  <a
                    key={dork.query}
                    href={dork.href}
                    rel="noopener noreferrer"
                    target="_blank"
                    title={dork.query}
                    className={cn(
                      buttonVariants({ variant: "link", size: "sm" }),
                      "justify-start w-fit h-fit gap-1 px-0 wrap-break-word",
                    )}
                  >
                    {dork.label}
                    <ExternalLink className="ml-1" />
                  </a>
                ))}
              </div>
            </ReadySummaryAccordion>
          ) : null}

          {/* Project selection - expandable accordion */}
          <ReadySummaryAccordion
            icon={FolderKanban}
            summary={
              <>
                {selectedProjectIds.length}{" "}
                {selectedProjectIds.length === 1 ? "project" : "projects"}{" "}
                selected
              </>
            }
            value="projects"
          >
            <ul className="list-disc text-xs text-muted-foreground space-y-1">
              {selectedProjectIds.map((id) => {
                const name = catalog.find((p) => p.id === id)?.name;
                if (!name) return null;
                return <li key={id}>{name}</li>;
              })}
              {selectedProjectIds.length === 0 && (
                <li className="list-none italic">No projects selected</li>
              )}
            </ul>
          </ReadySummaryAccordion>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          SECONDARY ACTIONS
          Fix/More menu - all non-critical actions demoted here
      ───────────────────────────────────────────────────────────────────── */}
      <div className="pt-3 border-t border-border/40">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 gap-2 text-xs text-muted-foreground hover:text-foreground justify-center"
            >
              More actions
              <ChevronUp className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56">
            {/* Fix/Edit actions */}
            <DropdownMenuItem onSelect={() => setMode("tailor")}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit tailoring
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openEditDetails}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => uploadPdfInputRef.current?.click()}
              disabled={isUploadingPdf}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploadingPdf
                ? "Uploading PDF..."
                : job.pdfPath
                  ? "Replace PDF"
                  : "Upload PDF"}
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={handleRegenerate}
              disabled={isRegenerating}
            >
              <RefreshCcw
                className={cn("mr-2 h-4 w-4", isRegenerating && "animate-spin")}
              />
              {isRegenerating ? "Regenerating..." : "Regenerate PDF"}
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={handleRescore} disabled={isRescoring}>
              <RefreshCcw
                className={cn("mr-2 h-4 w-4", isRescoring && "animate-spin")}
              />
              {isRescoring ? "Recalculating..." : "Recalculate match"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Utility actions */}
            <DropdownMenuItem onSelect={handleOpenPdf}>
              <FileText className="mr-2 h-4 w-4" />
              View PDF
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={handleCopyInfo}>
              <Copy className="mr-2 h-4 w-4" />
              Copy job info
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Destructive actions */}
            <DropdownMenuItem
              onSelect={handleSkip}
              className="text-destructive focus:text-destructive"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Skip this job
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <JobDetailsEditDrawer
        open={isEditDetailsOpen}
        onOpenChange={setIsEditDetailsOpen}
        job={job}
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

      {/* ─────────────────────────────────────────────────────────────────────
          UNDO BAR (conditional)
          Lightweight undo option after marking applied
      ───────────────────────────────────────────────────────────────────── */}
      {recentlyApplied && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-xl">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-2 shadow-lg">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">{recentlyApplied.jobTitle}</span>
              <span className="text-muted-foreground"> marked applied</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => handleUndoApplied(recentlyApplied.jobId)}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

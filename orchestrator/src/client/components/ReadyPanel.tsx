/**
 * ReadyPanel - Optimized "shipping lane" view for Ready jobs.
 * 
 * Designed for a single, fast, repeatable workflow: verify → download → apply → mark applied.
 * The PDF is the primary artifact, represented abstractly through an Application Kit summary.
 * 
 * Now includes inline tailoring mode for editing and regenerating PDFs without switching tabs.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  MoreHorizontal,
  RefreshCcw,
  Undo2,
  Copy,
  Edit2,
  XCircle,
  Briefcase,
  Building2,
  FolderKanban,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn, copyTextToClipboard, formatJobForWebhook } from "@/lib/utils";
import * as api from "../api";
import { FitAssessment, JobHeader, TailoredSummary } from ".";
import { TailorMode } from "./discovered-panel/TailorMode";
import { useProfile } from "../hooks/useProfile";
import type { Job, ResumeProjectCatalogItem } from "../../shared/types";

type PanelMode = "ready" | "tailor";

interface ReadyPanelProps {
  job: Job | null;
  onJobUpdated: () => void | Promise<void>;
  onJobMoved: (jobId: string) => void;
}

const safeFilenamePart = (value: string | null | undefined) =>
  (value || "Unknown").replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");

export const ReadyPanel: React.FC<ReadyPanelProps> = ({
  job,
  onJobUpdated,
  onJobMoved,
}) => {
  const [mode, setMode] = useState<PanelMode>("ready");
  const [isMarkingApplied, setIsMarkingApplied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [recentlyApplied, setRecentlyApplied] = useState<{
    jobId: string;
    jobTitle: string;
    employer: string;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);

  const { personName } = useProfile();

  // Load project catalog once
  useEffect(() => {
    api.getProfileProjects().then(setCatalog).catch(console.error);
  }, []);

  // Reset mode when job changes
  useEffect(() => {
    setMode("ready");
  }, [job?.id]);

  // Compute derived values
  const pdfHref = job
    ? `/pdfs/resume_${job.id}.pdf?v=${encodeURIComponent(job.updatedAt)}`
    : "#";

  const jobLink = job ? job.applicationLink || job.jobUrl : "#";

  const selectedProjectIds = useMemo(() => {
    return job?.selectedProjectIds?.split(",").filter(Boolean) ?? [];
  }, [job?.selectedProjectIds]);

  const selectedProjectNames = useMemo(() => {
    if (!catalog.length || !selectedProjectIds.length) return [];
    return selectedProjectIds
      .map(id => catalog.find(p => p.id === id)?.name)
      .filter(Boolean) as string[];
  }, [catalog, selectedProjectIds]);

  // Handle mark as applied with undo capability
  const handleMarkApplied = useCallback(async () => {
    if (!job) return;

    try {
      setIsMarkingApplied(true);
      await api.markAsApplied(job.id);

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
      const message = error instanceof Error ? error.message : "Failed to mark as applied";
      toast.error(message);
    } finally {
      setIsMarkingApplied(false);
    }
  }, [job, onJobMoved, onJobUpdated]);

  const handleUndoApplied = useCallback(
    async (jobId: string) => {
      try {
        // Revert to ready status
        await api.updateJob(jobId, { status: "ready" });
        toast.success("Reverted to Ready");

        if (recentlyApplied?.timeoutId) {
          clearTimeout(recentlyApplied.timeoutId);
        }
        setRecentlyApplied(null);
        await onJobUpdated();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to undo";
        toast.error(message);
      }
    },
    [onJobUpdated, recentlyApplied],
  );

  const handleRegenerate = useCallback(async () => {
    if (!job) return;

    try {
      setIsRegenerating(true);
      await api.generateJobPdf(job.id);
      toast.success("PDF regenerated");
      await onJobUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to regenerate PDF";
      toast.error(message);
    } finally {
      setIsRegenerating(false);
    }
  }, [job, onJobUpdated]);

  const handleSkip = useCallback(async () => {
    if (!job) return;

    try {
      await api.skipJob(job.id);
      toast.message("Job skipped");
      onJobMoved(job.id);
      await onJobUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to skip";
      toast.error(message);
    }
  }, [job, onJobMoved, onJobUpdated]);

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

  // Handler for regenerating PDF after tailoring edits
  const handleTailorFinalize = useCallback(async () => {
    if (!job) return;
    try {
      setIsRegenerating(true);
      await api.generateJobPdf(job.id);
      toast.success("PDF regenerated");
      await onJobUpdated();
      setMode("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to regenerate PDF";
      toast.error(message);
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
        <div className="text-sm font-medium text-muted-foreground">No job selected</div>
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
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <JobHeader
        job={job}
        className="pb-4 border-b border-border/40"
        onCheckSponsor={async () => {
          await api.checkSponsor(job.id);
          await onJobUpdated();
        }}
      />

      {/* ─────────────────────────────────────────────────────────────────────
          PRIMARY ACTION CLUSTER
          All actions in one line: View, Save, Open, and Mark Applied
      ───────────────────────────────────────────────────────────────────── */}
      <div className="pb-4 border-b border-border/40">
        <div className="grid gap-2 sm:grid-cols-2">
          {/* Show PDF - to verify quickly without download */}
          <Button asChild variant="outline" className="h-9 w-full gap-1 px-2 text-xs">
            <a href={pdfHref} target="_blank" rel="noopener noreferrer">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">View PDF</span>
            </a>
          </Button>

          {/* Download PDF - primary artifact action */}
          <Button asChild variant="outline" className="h-9 w-full gap-1 px-2 text-xs">
            <a
              href={pdfHref}
              download={`${safeFilenamePart(personName)}_${safeFilenamePart(job.employer)}.pdf`}
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Download PDF</span>
            </a>
          </Button>

          {/* Open job - to verify before applying */}
          <Button asChild variant="outline" className="h-9 w-full gap-1 px-2 text-xs">
            <a href={jobLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Open Job Listing</span>
            </a>
          </Button>

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
          </Button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          APPLICATION KIT SUMMARY
          Abstract representation of what the PDF contains - verify at a glance
      ───────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 py-4 space-y-4">
        {/* Job identity - confirm this is the right role */}
        <div className="space-y-3">
          <FitAssessment job={job} />
          <TailoredSummary job={job} />

          {/* Project selection - expandable accordion */}
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="projects" className="border-none">
              <AccordionTrigger className="hover:no-underline py-0 data-[state=open]:pb-2">
                <div className="flex items-center gap-3 w-full">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
                    <FolderKanban className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="text-sm font-medium text-foreground leading-tight">
                      {selectedProjectIds.length} {selectedProjectIds.length === 1 ? "project" : "projects"} selected
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 pl-11">
                <ul className="list-disc text-xs text-muted-foreground space-y-1">
                  {selectedProjectNames.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                  {selectedProjectNames.length === 0 && (
                    <li className="list-none italic">No projects selected</li>
                  )}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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

            <DropdownMenuItem
              onSelect={handleRegenerate}
              disabled={isRegenerating}
            >
              <RefreshCcw className={cn("mr-2 h-4 w-4", isRegenerating && "animate-spin")} />
              {isRegenerating ? "Regenerating..." : "Regenerate PDF"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Utility actions */}
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

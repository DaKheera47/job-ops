/**
 * DiscoveredPanel - Two-mode triage workspace for Discovered jobs.
 *
 * Mode A: Decide (default) - Quick assessment to Skip or Tailor
 * Mode B: Tailor - Draft tailoring data before moving to Ready
 *
 * Moving to Ready generates the PDF using the current tailored draft.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  DollarSign,
  ExternalLink,
  Loader2,
  MapPin,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import * as api from "../api";
import { FitAssessment } from ".";
import type { Job, ResumeProjectCatalogItem } from "../../shared/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PanelMode = "decide" | "tailor";

interface DiscoveredPanelProps {
  job: Job | null;
  onJobUpdated: () => void | Promise<void>;
  onJobMoved: (jobId: string) => void;
  onExpandFlow?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

const stripHtml = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sourceLabel: Record<Job["source"], string> = {
  gradcracker: "Gradcracker",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  ukvisajobs: "UK Visa Jobs",
};

// ─────────────────────────────────────────────────────────────────────────────
// Decide Mode Panel
// ─────────────────────────────────────────────────────────────────────────────

interface DecideModeProps {
  job: Job;
  onTailor: () => void;
  onSkip: () => void;
  isSkipping: boolean;
  onExpandFlow?: () => void;
}

const DecideMode: React.FC<DecideModeProps> = ({
  job,
  onTailor,
  onSkip,
  isSkipping,
  onExpandFlow,
}) => {
  const [showDescription, setShowDescription] = useState(false);
  const deadline = formatDate(job.deadline);
  const jobLink = job.applicationLink || job.jobUrl;

  const description = useMemo(() => {
    if (!job.jobDescription) return "No description available.";
    const jd = job.jobDescription;
    if (jd.includes("<") && jd.includes(">")) return stripHtml(jd);
    return jd;
  }, [job.jobDescription]);

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='space-y-3 pb-4'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0 flex-1'>
            <h2 className='text-base font-semibold text-foreground/90 leading-tight'>
              {job.title}
            </h2>
            <p className='text-sm text-muted-foreground mt-0.5'>
              {job.employer}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center">
            <Badge
              variant='outline'
              className='text-[10px] uppercase tracking-wide text-muted-foreground border-border/50 shrink-0'
            >
              {sourceLabel[job.source]}
            </Badge>
          </div>
        </div>

        {/* Metadata row */}
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80 justify-between'>
          {job.location && (
            <span className='flex items-center gap-1'>
              <MapPin className='h-3 w-3' />
              {job.location}
            </span>
          )}
          {deadline && (
            <span className='flex items-center gap-1'>
              <Calendar className='h-3 w-3' />
              {deadline}
            </span>
          )}
          {job.salary && (
            <span className='flex items-center gap-1'>
              <DollarSign className='h-3 w-3' />
              {job.salary}
            </span>
          )}
        </div>

        {/* Primary/Secondary actions */}
        <div className='flex flex-col gap-2 pt-2 sm:flex-row'>
          <Button
            variant='outline'
            size='default'
            onClick={onSkip}
            disabled={isSkipping}
            className='flex-1 h-11 text-sm text-muted-foreground hover:text-foreground hover:border-rose-500/30 hover:bg-rose-500/5 sm:h-10 sm:text-xs'
          >
            {isSkipping ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <XCircle className='mr-2 h-4 w-4' />
            )}
            Skip
          </Button>
          <Button
            size='default'
            onClick={onTailor}
            className='flex-1 h-11 text-sm bg-primary/90 hover:bg-primary sm:h-10 sm:text-xs'
          >
            <Sparkles className='mr-2 h-4 w-4' />
            Tailor
          </Button>
        </div>
      </div>

      <Separator className='opacity-50' />

      {/* Fit Summary - the core content */}
      <div className='flex-1 py-4 space-y-4 overflow-y-auto'>
        <FitAssessment job={job} />

        {/* Collapsible full description */}
        <div className='space-y-2'>
          <div className='flex items-center justify-between gap-2'>
            <button
              type='button'
              onClick={() => setShowDescription(!showDescription)}
              className='flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors'
            >
              {showDescription ? (
                <ChevronUp className='h-3.5 w-3.5' />
              ) : (
                <ChevronDown className='h-3.5 w-3.5' />
              )}
              {showDescription ? "Hide" : "View"} full job description
            </button>
            {onExpandFlow && (
              <button
                type='button'
                onClick={(event) => {
                  event.stopPropagation();
                  onExpandFlow();
                }}
                className='text-[10px] text-muted-foreground hover:text-foreground transition-colors'
              >
                Expand
              </button>
            )}
          </div>

          {showDescription && (
            <div className='rounded-lg border border-border/40 bg-muted/5 p-3 max-h-[300px] overflow-y-auto'>
              <p className='text-xs text-muted-foreground/80 whitespace-pre-wrap leading-relaxed'>
                {description}
              </p>
            </div>
          )}
        </div>
      </div>

      <Separator className='opacity-50' />

      {/* Actions - clear hierarchy */}
      <div className='pt-4 pb-2'>
        {/* External link - tertiary */}
        <div className='flex justify-center'>
          <a
            href={jobLink}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors'
          >
            <ExternalLink className='h-3 w-3' />
            View original listing
          </a>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tailor Mode Panel
// ─────────────────────────────────────────────────────────────────────────────

interface TailorModeProps {
  job: Job;
  onBack: () => void;
  onFinalize: () => void;
  isFinalizing: boolean;
  onExpandFlow?: () => void;
}

const TailorMode: React.FC<TailorModeProps> = ({
  job,
  onBack,
  onFinalize,
  isFinalizing,
  onExpandFlow,
}) => {
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [summary, setSummary] = useState(job.tailoredSummary || "");
  const [jobDescription, setJobDescription] = useState(job.jobDescription || "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const saved = job.selectedProjectIds?.split(",").filter(Boolean) ?? [];
    return new Set(saved);
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "unsaved" | "saving" | "saved"
  >("saved");
  const [showDescription, setShowDescription] = useState(false);

  // Load project catalog
  useEffect(() => {
    api.getProfileProjects().then(setCatalog).catch(console.error);
  }, []);

  // Reset form when job changes
  useEffect(() => {
    setSummary(job.tailoredSummary || "");
    setJobDescription(job.jobDescription || "");
    const saved = job.selectedProjectIds?.split(",").filter(Boolean) ?? [];
    setSelectedIds(new Set(saved));
    setDraftStatus("saved");
  }, [job.id, job.tailoredSummary, job.selectedProjectIds, job.jobDescription]);

  // Track unsaved changes
  const savedSummary = job.tailoredSummary || "";
  const savedDescription = job.jobDescription || "";
  const savedIds = useMemo(() => {
    const saved = job.selectedProjectIds?.split(",").filter(Boolean) ?? [];
    return new Set(saved);
  }, [job.selectedProjectIds]);

  const hasChanges = useMemo(() => {
    if (summary !== savedSummary) return true;
    if (jobDescription !== savedDescription) return true;
    if (selectedIds.size !== savedIds.size) return true;
    for (const id of selectedIds) {
      if (!savedIds.has(id)) return true;
    }
    return false;
  }, [summary, savedSummary, jobDescription, savedDescription, selectedIds, savedIds]);

  // Update draft status when changes are made
  useEffect(() => {
    if (hasChanges && draftStatus === "saved") {
      setDraftStatus("unsaved");
    }
  }, [hasChanges, draftStatus]);

  // Auto-save draft (debounced)
  useEffect(() => {
    if (!hasChanges || draftStatus !== "unsaved") return;

    const timeout = setTimeout(async () => {
      try {
        setDraftStatus("saving");
        await api.updateJob(job.id, {
          tailoredSummary: summary,
          jobDescription: jobDescription,
          selectedProjectIds: Array.from(selectedIds).join(","),
        });
        setDraftStatus("saved");
      } catch {
        setDraftStatus("unsaved");
      }
    }, 1500);

    return () => clearTimeout(timeout);
  }, [summary, jobDescription, selectedIds, hasChanges, draftStatus, job.id]);

  const handleToggleProject = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleGenerateWithAI = async () => {
    try {
      setIsGenerating(true);

      // Save any pending changes first so AI uses the latest description
      if (hasChanges) {
        await api.updateJob(job.id, {
          tailoredSummary: summary,
          jobDescription: jobDescription,
          selectedProjectIds: Array.from(selectedIds).join(","),
        });
      }

      const updatedJob = await api.summarizeJob(job.id, { force: true });
      setSummary(updatedJob.tailoredSummary || "");
      setJobDescription(updatedJob.jobDescription || "");
      if (updatedJob.selectedProjectIds) {
        setSelectedIds(
          new Set(updatedJob.selectedProjectIds.split(",").filter(Boolean))
        );
      }
      setDraftStatus("saved"); // AI response is saved server-side
      toast.success("Draft generated with AI", {
        description: "Review and edit before finalizing.",
      });
    } catch {
      toast.error("Failed to generate AI draft");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFinalize = async () => {
    // Save any pending changes first
    if (hasChanges) {
      try {
        setIsSaving(true);
        await api.updateJob(job.id, {
          tailoredSummary: summary,
          jobDescription: jobDescription,
          selectedProjectIds: Array.from(selectedIds).join(","),
        });
      } catch {
        toast.error("Failed to save draft before finalizing");
        setIsSaving(false);
        return;
      } finally {
        setIsSaving(false);
      }
    }

    // Now finalize (which generates PDF and moves to Ready)
    onFinalize();
  };

  const maxProjects = 3;
  const tooManyProjects = selectedIds.size > maxProjects;
  const canFinalize = summary.trim().length > 0 && selectedIds.size > 0;

  return (
    <div className='flex flex-col h-full'>
      {/* Header with back navigation */}
      <div className='flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between'>
        <button
          type='button'
          onClick={onBack}
          className='flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors'
        >
          <ArrowLeft className='h-3.5 w-3.5' />
          Back to overview
        </button>

        {/* Draft status indicator */}
        <div className='flex items-center gap-1.5 text-[10px] text-muted-foreground'>
          {draftStatus === "saving" && (
            <>
              <Loader2 className='h-3 w-3 animate-spin' />
              Saving...
            </>
          )}
          {draftStatus === "saved" && !hasChanges && (
            <>
              <Check className='h-3 w-3 text-emerald-400' />
              Saved
            </>
          )}
          {draftStatus === "unsaved" && (
            <span className='text-amber-400'>Unsaved changes</span>
          )}
        </div>
      </div>

      {/* Draft framing */}
      <div className='rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 mb-4'>
        <div className='flex items-center gap-2'>
          <div className='h-2 w-2 rounded-full bg-amber-400 animate-pulse' />
          <span className='text-xs font-medium text-amber-300'>
            Draft tailoring for this role
          </span>
        </div>
        <p className='text-[10px] text-muted-foreground mt-1 ml-4'>
          Edit below, then finalize to generate your PDF and move to Ready.
        </p>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto space-y-4 pr-1'>
        {/* AI Generate option */}
        <div className='flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <div className='text-xs font-medium'>
              Need help getting started?
            </div>
            <div className='text-[10px] text-muted-foreground'>
              AI can draft a summary and select projects for you
            </div>
          </div>
          <Button
            size='sm'
            variant='outline'
            onClick={handleGenerateWithAI}
            disabled={isGenerating || isFinalizing}
            className='h-8 w-full text-xs sm:w-auto'
          >
            {isGenerating ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <Sparkles className='mr-1.5 h-3.5 w-3.5' />
            )}
            Generate draft
          </Button>
        </div>

        {/* Job Description - collapsible */}
        <div className='space-y-2'>
          <div className='flex items-center justify-between gap-2'>
            <button
              type='button'
              onClick={() => setShowDescription(!showDescription)}
              className='flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors'
            >
              {showDescription ? (
                <ChevronUp className='h-3.5 w-3.5' />
              ) : (
                <ChevronDown className='h-3.5 w-3.5' />
              )}
              {showDescription ? "Hide" : "Edit"} job description
            </button>
            {onExpandFlow && (
              <button
                type='button'
                onClick={(event) => {
                  event.stopPropagation();
                  onExpandFlow();
                }}
                className='text-[10px] text-muted-foreground hover:text-foreground transition-colors'
              >
                Expand
              </button>
            )}
          </div>

          {showDescription && (
            <div className='space-y-1'>
              <label className='text-[10px] font-medium text-muted-foreground/70'>
                Edit to help AI tailoring
              </label>
              <textarea
                className='w-full min-h-[120px] max-h-[250px] rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder='The raw job description...'
                disabled={isGenerating || isFinalizing}
              />
            </div>
          )}
        </div>

        {/* Tailored Summary */}
        <div className='space-y-2'>
          <label className='text-xs font-medium text-muted-foreground'>
            Tailored Summary
          </label>
          <textarea
            className='w-full min-h-[100px] rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder='Write a tailored summary for this role, or generate with AI...'
            disabled={isGenerating || isFinalizing}
          />
        </div>

        {/* Selected Projects */}
        <div className='space-y-2'>
          <div className='flex flex-wrap items-start gap-2 sm:items-center sm:justify-between'>
            <label className='text-xs font-medium text-muted-foreground'>
              Selected Projects
            </label>
            {tooManyProjects && (
              <span className='flex items-center gap-1 text-[10px] text-amber-500 font-medium'>
                <AlertTriangle className='h-3 w-3' />
                Max {maxProjects} recommended
              </span>
            )}
          </div>

          <div className='space-y-1.5 max-h-[200px] overflow-y-auto pr-1'>
            {catalog.length === 0 ? (
              <div className='text-xs text-muted-foreground text-center py-4'>
                Loading projects...
              </div>
            ) : (
              catalog.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer",
                    selectedIds.has(project.id)
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 bg-muted/5 hover:bg-muted/10"
                  )}
                  onClick={() =>
                    !isGenerating &&
                    !isFinalizing &&
                    handleToggleProject(project.id)
                  }
                >
                  <Checkbox
                    id={`project-${project.id}`}
                    checked={selectedIds.has(project.id)}
                    onCheckedChange={() => handleToggleProject(project.id)}
                    disabled={isGenerating || isFinalizing}
                    className='mt-0.5'
                  />
                  <div className='flex-1 min-w-0'>
                    <div className='font-medium truncate'>{project.name}</div>
                    <div className='text-[10px] text-muted-foreground line-clamp-1 mt-0.5'>
                      {project.description}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Separator className='opacity-50 my-4' />

      {/* Actions */}
      <div className='space-y-2'>
        {!canFinalize && (
          <p className='text-[10px] text-center text-muted-foreground'>
            Add a summary and select at least one project to finalize.
          </p>
        )}
        <Button
          onClick={handleFinalize}
          disabled={isFinalizing || !canFinalize || isGenerating}
          className='w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white'
        >
          {isFinalizing ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              Finalizing & generating PDF...
            </>
          ) : (
            <>
              <Check className='mr-2 h-4 w-4' />
              Finalize & Move to Ready
            </>
          )}
        </Button>
        <p className='text-[10px] text-center text-muted-foreground/70'>
          This will generate your tailored PDF and move the job to Ready.
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Panel Component
// ─────────────────────────────────────────────────────────────────────────────

export const DiscoveredPanel: React.FC<DiscoveredPanelProps> = ({
  job,
  onJobUpdated,
  onJobMoved,
  onExpandFlow,
}) => {
  const [mode, setMode] = useState<PanelMode>("decide");
  const [isSkipping, setIsSkipping] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Reset mode when job changes
  useEffect(() => {
    setMode("decide");
    setIsSkipping(false);
    setIsFinalizing(false);
  }, [job?.id]);

  const handleSkip = async () => {
    if (!job) return;
    try {
      setIsSkipping(true);
      await api.skipJob(job.id);
      toast.message("Job skipped");
      onJobMoved(job.id);
      await onJobUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to skip job";
      toast.error(message);
    } finally {
      setIsSkipping(false);
    }
  };

  const handleFinalize = async () => {
    if (!job) return;
    try {
      setIsFinalizing(true);

      // Generate PDF - this also transitions to Ready status
      await api.processJob(job.id);

      toast.success("Job moved to Ready", {
        description: "Your tailored PDF has been generated.",
      });

      onJobMoved(job.id);
      await onJobUpdated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to finalize job";
      toast.error(message);
    } finally {
      setIsFinalizing(false);
    }
  };

  // Empty state
  if (!job) {
    return (
      <div className='flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center px-4'>
        <div className='h-10 w-10 rounded-full border border-border/40 bg-muted/20 flex items-center justify-center'>
          <Sparkles className='h-4 w-4 text-muted-foreground/50' />
        </div>
        <div className='text-sm font-medium text-muted-foreground'>
          No job selected
        </div>
        <p className='text-xs text-muted-foreground/70 max-w-[200px]'>
          Select a job from the list to see details and decide whether to
          tailor.
        </p>
      </div>
    );
  }

  // Processing state (job is being processed by pipeline)
  if (job.status === "processing") {
    return (
      <div className='flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-center px-4'>
        <Loader2 className='h-8 w-8 animate-spin text-amber-400' />
        <div className='text-sm font-medium text-foreground/80'>
          Processing job...
        </div>
        <p className='text-xs text-muted-foreground max-w-[220px]'>
          This job is currently being analyzed by the pipeline. Please wait.
        </p>
      </div>
    );
  }

  return (
    <div className='h-full'>
      {mode === "decide" ? (
        <DecideMode
          job={job}
          onTailor={() => setMode("tailor")}
          onSkip={handleSkip}
          isSkipping={isSkipping}
          onExpandFlow={onExpandFlow}
        />
      ) : (
        <TailorMode
          job={job}
          onBack={() => setMode("decide")}
          onFinalize={handleFinalize}
          isFinalizing={isFinalizing}
          onExpandFlow={onExpandFlow}
        />
      )}
    </div>
  );
};

export default DiscoveredPanel;

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import * as api from "../../api";
import type { Job, ResumeProjectCatalogItem } from "../../../shared/types";
import { CollapsibleSection } from "./CollapsibleSection";
import { ProjectSelector } from "./ProjectSelector";

interface TailorModeProps {
  job: Job;
  onBack: () => void;
  onFinalize: () => void;
  isFinalizing: boolean;
  /** Variant controls the finalize button text. Default is 'discovered'. */
  variant?: 'discovered' | 'ready';
}

export const TailorMode: React.FC<TailorModeProps> = ({
  job,
  onBack,
  onFinalize,
  isFinalizing,
  variant = 'discovered',
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

  useEffect(() => {
    api.getProfileProjects().then(setCatalog).catch(console.error);
  }, []);

  useEffect(() => {
    setSummary(job.tailoredSummary || "");
    setJobDescription(job.jobDescription || "");
    const saved = job.selectedProjectIds?.split(",").filter(Boolean) ?? [];
    setSelectedIds(new Set(saved));
    setDraftStatus("saved");
  }, [job.id, job.tailoredSummary, job.selectedProjectIds, job.jobDescription]);

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

  useEffect(() => {
    if (hasChanges && draftStatus === "saved") {
      setDraftStatus("unsaved");
    }
  }, [hasChanges, draftStatus]);

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

  const handleToggleProject = useCallback(
    (id: string) => {
      if (isGenerating || isFinalizing) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [isGenerating, isFinalizing]
  );

  const handleGenerateWithAI = async () => {
    try {
      setIsGenerating(true);

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
      setDraftStatus("saved");
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

    onFinalize();
  };

  const maxProjects = 3;
  const canFinalize = summary.trim().length > 0 && selectedIds.size > 0;
  const disableInputs = isGenerating || isFinalizing || isSaving;

  return (
    <div className='flex flex-col h-full'>
      <div className='flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between'>
        <button
          type='button'
          onClick={onBack}
          className='flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors'
        >
          <ArrowLeft className='h-3.5 w-3.5' />
          Back to overview
        </button>

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

      <div className='flex-1 overflow-y-auto space-y-4 pr-1'>
        <div className='flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <div className='text-xs font-medium'>Need help getting started?</div>
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

        <CollapsibleSection
          isOpen={showDescription}
          onToggle={() => setShowDescription((prev) => !prev)}
          label={`${showDescription ? "Hide" : "Edit"} job description`}
        >
          <div className='space-y-1'>
            <label className='text-[10px] font-medium text-muted-foreground/70'>
              Edit to help AI tailoring
            </label>
            <textarea
              className='w-full min-h-[120px] max-h-[250px] rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder='The raw job description...'
              disabled={disableInputs}
            />
          </div>
        </CollapsibleSection>

        <div className='space-y-2'>
          <label className='text-xs font-medium text-muted-foreground'>
            Tailored Summary
          </label>
          <textarea
            className='w-full min-h-[100px] rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder='Write a tailored summary for this role, or generate with AI...'
            disabled={disableInputs}
          />
        </div>

        <ProjectSelector
          catalog={catalog}
          selectedIds={selectedIds}
          onToggle={handleToggleProject}
          maxProjects={maxProjects}
          disabled={disableInputs}
        />
      </div>

      <Separator className='opacity-50 my-4' />

      <div className='space-y-2'>
        {!canFinalize && (
          <p className='text-[10px] text-center text-muted-foreground'>
            Add a summary and select at least one project to {variant === 'ready' ? 'regenerate' : 'finalize'}.
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
              {variant === 'ready' ? 'Regenerating PDF...' : 'Finalizing & generating PDF...'}
            </>
          ) : (
            <>
              <Check className='mr-2 h-4 w-4' />
              {variant === 'ready' ? 'Regenerate PDF' : 'Finalize & Move to Ready'}
            </>
          )}
        </Button>
        <p className='text-[10px] text-center text-muted-foreground/70'>
          {variant === 'ready'
            ? 'This will save your changes and regenerate the tailored PDF.'
            : 'This will generate your tailored PDF and move the job to Ready.'}
        </p>
      </div>
    </div>
  );
};

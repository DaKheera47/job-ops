import type { Job, ResumeProjectCatalogItem } from "@shared/types.js";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import * as api from "../../api";
import { CollapsibleSection } from "./CollapsibleSection";
import { ProjectSelector } from "./ProjectSelector";

interface TailorModeProps {
  job: Job;
  onBack: () => void;
  onFinalize: () => void;
  isFinalizing: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  /** Variant controls the finalize button text. Default is 'discovered'. */
  variant?: "discovered" | "ready";
}

const parseSelectedIds = (value: string | null | undefined) =>
  new Set(value?.split(",").filter(Boolean) ?? []);

const hasSelectionDiff = (current: Set<string>, saved: Set<string>) => {
  if (current.size !== saved.size) return true;
  for (const id of current) {
    if (!saved.has(id)) return true;
  }
  return false;
};

export const TailorMode: React.FC<TailorModeProps> = ({
  job,
  onBack,
  onFinalize,
  isFinalizing,
  onDirtyChange,
  variant = "discovered",
}) => {
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [summary, setSummary] = useState(job.tailoredSummary || "");
  const [jobDescription, setJobDescription] = useState(
    job.jobDescription || "",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    parseSelectedIds(job.selectedProjectIds),
  );

  const [savedSummary, setSavedSummary] = useState(job.tailoredSummary || "");
  const [savedDescription, setSavedDescription] = useState(
    job.jobDescription || "",
  );
  const [savedSelectedIds, setSavedSelectedIds] = useState<Set<string>>(() =>
    parseSelectedIds(job.selectedProjectIds),
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "unsaved" | "saving" | "saved"
  >("saved");
  const [showDescription, setShowDescription] = useState(false);
  const [activeField, setActiveField] = useState<
    "summary" | "description" | null
  >(null);
  const lastJobIdRef = useRef(job.id);

  useEffect(() => {
    api.getResumeProjectsCatalog().then(setCatalog).catch(console.error);
  }, []);

  const isDirty = useMemo(() => {
    if (summary !== savedSummary) return true;
    if (jobDescription !== savedDescription) return true;
    return hasSelectionDiff(selectedIds, savedSelectedIds);
  }, [
    summary,
    savedSummary,
    jobDescription,
    savedDescription,
    selectedIds,
    savedSelectedIds,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  useEffect(() => {
    const incomingSummary = job.tailoredSummary || "";
    const incomingDescription = job.jobDescription || "";
    const incomingSelectedIds = parseSelectedIds(job.selectedProjectIds);

    if (job.id !== lastJobIdRef.current) {
      lastJobIdRef.current = job.id;
      setSummary(incomingSummary);
      setJobDescription(incomingDescription);
      setSelectedIds(incomingSelectedIds);
      setSavedSummary(incomingSummary);
      setSavedDescription(incomingDescription);
      setSavedSelectedIds(incomingSelectedIds);
      setDraftStatus("saved");
      return;
    }

    if (isDirty || activeField !== null) return;

    setSummary(incomingSummary);
    setJobDescription(incomingDescription);
    setSelectedIds(incomingSelectedIds);
    setSavedSummary(incomingSummary);
    setSavedDescription(incomingDescription);
    setSavedSelectedIds(incomingSelectedIds);
    setDraftStatus("saved");
  }, [
    job.id,
    job.tailoredSummary,
    job.jobDescription,
    job.selectedProjectIds,
    isDirty,
    activeField,
  ]);

  useEffect(() => {
    if (isDirty && draftStatus === "saved") {
      setDraftStatus("unsaved");
    }
    if (!isDirty && draftStatus === "unsaved") {
      setDraftStatus("saved");
    }
  }, [isDirty, draftStatus]);

  const selectedIdsCsv = useMemo(
    () => Array.from(selectedIds).join(","),
    [selectedIds],
  );

  const syncSavedSnapshot = useCallback(
    (
      nextSummary: string,
      nextDescription: string,
      nextSelectedIds: Set<string>,
    ) => {
      setSavedSummary(nextSummary);
      setSavedDescription(nextDescription);
      setSavedSelectedIds(new Set(nextSelectedIds));
      setDraftStatus("saved");
    },
    [],
  );

  const persistCurrent = useCallback(async () => {
    await api.updateJob(job.id, {
      tailoredSummary: summary,
      jobDescription,
      selectedProjectIds: selectedIdsCsv,
    });
    syncSavedSnapshot(summary, jobDescription, selectedIds);
  }, [
    job.id,
    summary,
    jobDescription,
    selectedIdsCsv,
    selectedIds,
    syncSavedSnapshot,
  ]);

  useEffect(() => {
    if (!isDirty || draftStatus !== "unsaved") return;

    const timeout = setTimeout(async () => {
      try {
        setDraftStatus("saving");
        await persistCurrent();
      } catch {
        setDraftStatus("unsaved");
      }
    }, 1500);

    return () => clearTimeout(timeout);
  }, [isDirty, draftStatus, persistCurrent]);

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
    [isGenerating, isFinalizing],
  );

  const handleGenerateWithAI = async () => {
    try {
      setIsGenerating(true);

      if (isDirty) {
        await persistCurrent();
      }

      const updatedJob = await api.summarizeJob(job.id, { force: true });
      const nextSummary = updatedJob.tailoredSummary || "";
      const nextDescription = updatedJob.jobDescription || "";
      const nextSelectedIds = parseSelectedIds(updatedJob.selectedProjectIds);
      setSummary(nextSummary);
      setJobDescription(nextDescription);
      setSelectedIds(nextSelectedIds);
      syncSavedSnapshot(nextSummary, nextDescription, nextSelectedIds);
      toast.success("Draft generated with AI", {
        description: "Review and edit before finalizing.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate AI draft";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFinalize = async () => {
    if (isDirty) {
      try {
        setIsSaving(true);
        await persistCurrent();
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
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to overview
        </button>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {draftStatus === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </>
          )}
          {draftStatus === "saved" && !isDirty && (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              Saved
            </>
          )}
          {draftStatus === "unsaved" && (
            <span className="text-amber-400">Unsaved changes</span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-medium text-amber-300">
            Draft tailoring for this role
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 ml-4">
          Edit below, then finalize to generate your PDF and move to Ready.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium">
              Need help getting started?
            </div>
            <div className="text-[10px] text-muted-foreground">
              AI can draft a summary and select projects for you
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateWithAI}
            disabled={isGenerating || isFinalizing}
            className="h-8 w-full text-xs sm:w-auto"
          >
            {isGenerating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate draft
          </Button>
        </div>

        <CollapsibleSection
          isOpen={showDescription}
          onToggle={() => setShowDescription((prev) => !prev)}
          label={`${showDescription ? "Hide" : "Edit"} job description`}
        >
          <div className="space-y-1">
            <label
              htmlFor="tailor-jd-edit"
              className="text-[10px] font-medium text-muted-foreground/70"
            >
              Edit to help AI tailoring
            </label>
            <textarea
              id="tailor-jd-edit"
              className="w-full min-h-[120px] max-h-[250px] rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              onFocus={() => setActiveField("description")}
              onBlur={() =>
                setActiveField((prev) => (prev === "description" ? null : prev))
              }
              placeholder="The raw job description..."
              disabled={disableInputs}
            />
          </div>
        </CollapsibleSection>

        <div className="space-y-2">
          <label
            htmlFor="tailor-summary-edit"
            className="text-xs font-medium text-muted-foreground"
          >
            Tailored Summary
          </label>
          <textarea
            id="tailor-summary-edit"
            className="w-full min-h-[100px] rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            onFocus={() => setActiveField("summary")}
            onBlur={() =>
              setActiveField((prev) => (prev === "summary" ? null : prev))
            }
            placeholder="Write a tailored summary for this role, or generate with AI..."
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

      <Separator className="opacity-50 my-4" />

      <div className="space-y-2">
        {!canFinalize && (
          <p className="text-[10px] text-center text-muted-foreground">
            Add a summary and select at least one project to{" "}
            {variant === "ready" ? "regenerate" : "finalize"}.
          </p>
        )}
        <Button
          onClick={handleFinalize}
          disabled={isFinalizing || !canFinalize || isGenerating}
          className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {isFinalizing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {variant === "ready"
                ? "Regenerating PDF..."
                : "Finalizing & generating PDF..."}
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              {variant === "ready"
                ? "Regenerate PDF"
                : "Finalize & Move to Ready"}
            </>
          )}
        </Button>
        <p className="text-[10px] text-center text-muted-foreground/70">
          {variant === "ready"
            ? "This will save your changes and regenerate the tailored PDF."
            : "This will generate your tailored PDF and move the job to Ready."}
        </p>
      </div>
    </div>
  );
};

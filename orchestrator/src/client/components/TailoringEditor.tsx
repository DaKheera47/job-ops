import type { Job, ResumeProjectCatalogItem } from "@shared/types.js";
import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import * as api from "../api";

interface TailoringEditorProps {
  job: Job;
  onUpdate: () => void | Promise<void>;
  onDirtyChange?: (isDirty: boolean) => void;
  onRegisterSave?: (save: () => Promise<void>) => void;
  onBeforeGenerate?: () => boolean | Promise<boolean>;
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

export const TailoringEditor: React.FC<TailoringEditorProps> = ({
  job,
  onUpdate,
  onDirtyChange,
  onRegisterSave,
  onBeforeGenerate,
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
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeField, setActiveField] = useState<
    "summary" | "description" | null
  >(null);
  const lastJobIdRef = useRef(job.id);

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
    api.getResumeProjectsCatalog().then(setCatalog).catch(console.error);
  }, []);

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
      return;
    }

    if (isDirty || activeField !== null) return;

    setSummary(incomingSummary);
    setJobDescription(incomingDescription);
    setSelectedIds(incomingSelectedIds);
    setSavedSummary(incomingSummary);
    setSavedDescription(incomingDescription);
    setSavedSelectedIds(incomingSelectedIds);
  }, [
    job.id,
    job.tailoredSummary,
    job.jobDescription,
    job.selectedProjectIds,
    isDirty,
    activeField,
  ]);

  const syncSavedSnapshot = useCallback(
    (
      nextSummary: string,
      nextDescription: string,
      nextSelectedIds: Set<string>,
    ) => {
      setSavedSummary(nextSummary);
      setSavedDescription(nextDescription);
      setSavedSelectedIds(new Set(nextSelectedIds));
    },
    [],
  );

  const selectedIdsCsv = useMemo(
    () => Array.from(selectedIds).join(","),
    [selectedIds],
  );

  const saveChanges = useCallback(
    async ({ showToast = true }: { showToast?: boolean } = {}) => {
      try {
        setIsSaving(true);
        await api.updateJob(job.id, {
          tailoredSummary: summary,
          jobDescription,
          selectedProjectIds: selectedIdsCsv,
        });
        syncSavedSnapshot(summary, jobDescription, selectedIds);
        if (showToast) toast.success("Changes saved");
        await onUpdate();
      } catch (error) {
        if (showToast) toast.error("Failed to save changes");
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [
      job.id,
      onUpdate,
      selectedIdsCsv,
      selectedIds,
      summary,
      jobDescription,
      syncSavedSnapshot,
    ],
  );

  useEffect(() => {
    onRegisterSave?.(() => saveChanges({ showToast: false }));
  }, [onRegisterSave, saveChanges]);

  const handleToggleProject = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSave = async () => {
    try {
      await saveChanges();
    } catch {
      // Toast handled in saveChanges
    }
  };

  const handleSummarize = async () => {
    try {
      setIsSummarizing(true);
      if (isDirty) {
        await saveChanges({ showToast: false });
      }
      const updatedJob = await api.summarizeJob(job.id, { force: true });
      const nextSummary = updatedJob.tailoredSummary || "";
      const nextDescription = updatedJob.jobDescription || "";
      const nextSelectedIds = parseSelectedIds(updatedJob.selectedProjectIds);
      setSummary(nextSummary);
      setJobDescription(nextDescription);
      setSelectedIds(nextSelectedIds);
      syncSavedSnapshot(nextSummary, nextDescription, nextSelectedIds);
      toast.success("AI Summary & Projects generated");
      await onUpdate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI summarization failed";
      toast.error(message);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGeneratePdf = async () => {
    try {
      const shouldProceed = onBeforeGenerate ? await onBeforeGenerate() : true;
      if (shouldProceed === false) return;

      setIsGeneratingPdf(true);
      await saveChanges({ showToast: false });

      await api.generateJobPdf(job.id);
      toast.success("Resume PDF generated");
      await onUpdate();
    } catch (_error) {
      toast.error("PDF generation failed");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const maxProjects = 3;
  const tooManyProjects = selectedIds.size > maxProjects;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Editor</h3>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSummarize}
            disabled={isSummarizing || isGeneratingPdf || isSaving}
            className="w-full sm:w-auto"
          >
            {isSummarizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            AI Summarize
          </Button>
          <Button
            size="sm"
            onClick={handleGeneratePdf}
            disabled={isSummarizing || isGeneratingPdf || isSaving || !summary}
            className="w-full sm:w-auto"
          >
            {isGeneratingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Generate PDF
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-2">
          <label htmlFor="tailor-jd" className="text-sm font-medium">
            Job Description (Edit to help AI tailoring)
          </label>
          <textarea
            id="tailor-jd"
            className="w-full min-h-[120px] max-h-[250px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            onFocus={() => setActiveField("description")}
            onBlur={() =>
              setActiveField((prev) => (prev === "description" ? null : prev))
            }
            placeholder="The raw job description..."
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <label htmlFor="tailor-summary" className="text-sm font-medium">
            Tailored Summary
          </label>
          <textarea
            id="tailor-summary"
            className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onFocus={() => setActiveField("summary")}
            onBlur={() =>
              setActiveField((prev) => (prev === "summary" ? null : prev))
            }
            placeholder="AI will generate this, or you can write your own..."
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-2 sm:items-center sm:justify-between">
            <span className="text-sm font-medium">Selected Projects</span>
            {tooManyProjects && (
              <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                <AlertTriangle className="h-3 w-3" />
                Warning: More than {maxProjects} projects might make the resume
                too long.
              </span>
            )}
          </div>
          <div className="grid gap-2 max-h-[300px] overflow-auto pr-2">
            {catalog.map((project) => (
              <div
                key={project.id}
                className="flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  id={`project-${project.id}`}
                  checked={selectedIds.has(project.id)}
                  onCheckedChange={() => handleToggleProject(project.id)}
                  className="mt-1"
                />
                <label
                  htmlFor={`project-${project.id}`}
                  className="flex flex-1 flex-col gap-1 cursor-pointer"
                >
                  <span className="font-semibold">{project.name}</span>
                  <span className="text-xs text-muted-foreground line-clamp-2">
                    {project.description}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Save Selection
          </Button>
        </div>
      </div>
    </div>
  );
};

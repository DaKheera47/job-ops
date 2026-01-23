import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import * as api from "../api";
import type { Job, ResumeProjectCatalogItem } from "../../shared/types";

interface TailoringEditorProps {
  job: Job;
  onUpdate: () => void | Promise<void>;
  onDirtyChange?: (isDirty: boolean) => void;
  onRegisterSave?: (save: () => Promise<void>) => void;
  onBeforeGenerate?: () => boolean | Promise<boolean>;
}

export const TailoringEditor: React.FC<TailoringEditorProps> = ({
  job,
  onUpdate,
  onDirtyChange,
  onRegisterSave,
  onBeforeGenerate,
}) => {
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [summary, setSummary] = useState(job.tailoredSummary || "");
  const [jobDescription, setJobDescription] = useState(job.jobDescription || "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const savedSelectedIds = useMemo(() => {
    const saved = job.selectedProjectIds?.split(",").filter(Boolean) ?? [];
    return new Set(saved);
  }, [job.selectedProjectIds]);

  const hasSelectionDiff = useMemo(() => {
    if (selectedIds.size !== savedSelectedIds.size) return true;
    for (const id of selectedIds) {
      if (!savedSelectedIds.has(id)) return true;
    }
    return false;
  }, [selectedIds, savedSelectedIds]);

  const isDirty = summary !== (job.tailoredSummary || "") || 
                  jobDescription !== (job.jobDescription || "") ||
                  hasSelectionDiff;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    // Load project catalog
    api.getResumeProjectsCatalog().then(setCatalog).catch(console.error);
    
    // Set initial selection
    if (job.selectedProjectIds) {
      setSelectedIds(new Set(job.selectedProjectIds.split(',').filter(Boolean)));
    }
    setJobDescription(job.jobDescription || "");
  }, [job.selectedProjectIds, job.jobDescription]);

  useEffect(() => {
    setSummary(job.tailoredSummary || "");
  }, [job.tailoredSummary]);

  const saveChanges = useCallback(
    async ({ showToast = true }: { showToast?: boolean } = {}) => {
      try {
        setIsSaving(true);
        await api.updateJob(job.id, {
          tailoredSummary: summary,
          jobDescription: jobDescription,
          selectedProjectIds: Array.from(selectedIds).join(","),
        });
        if (showToast) toast.success("Changes saved");
        await onUpdate();
      } catch (error) {
        if (showToast) toast.error("Failed to save changes");
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [job.id, onUpdate, selectedIds, summary, jobDescription],
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
      // Save changes first so AI uses latest description
      if (isDirty) {
        await saveChanges({ showToast: false });
      }
      const updatedJob = await api.summarizeJob(job.id, { force: true });
      setSummary(updatedJob.tailoredSummary || "");
      setJobDescription(updatedJob.jobDescription || "");
      if (updatedJob.selectedProjectIds) {
        setSelectedIds(new Set(updatedJob.selectedProjectIds.split(',').filter(Boolean)));
      }
      toast.success("AI Summary & Projects generated");
      await onUpdate();
    } catch (error) {
      toast.error("AI summarization failed");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGeneratePdf = async () => {
    try {
      const shouldProceed = onBeforeGenerate ? await onBeforeGenerate() : true;
      if (shouldProceed === false) return;

      setIsGeneratingPdf(true);
      // Save current state first to ensure PDF uses latest
      await saveChanges({ showToast: false });
      
      await api.generateJobPdf(job.id);
      toast.success("Resume PDF generated");
      await onUpdate();
    } catch (error) {
      toast.error("PDF generation failed");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const maxProjects = 3; // Example limit, could come from settings
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
            {isSummarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            AI Summarize
          </Button>
          <Button
            size="sm"
            onClick={handleGeneratePdf}
            disabled={isSummarizing || isGeneratingPdf || isSaving || !summary}
            className="w-full sm:w-auto"
          >
            {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Generate PDF
          </Button>
        </div>
      </div>
      
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium">Job Description (Edit to help AI tailoring)</label>
          <textarea
            className="w-full min-h-[120px] max-h-[250px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="The raw job description..."
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <label className="text-sm font-medium">Tailored Summary</label>
          <textarea
            className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="AI will generate this, or you can write your own..."
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-2 sm:items-center sm:justify-between">
            <label className="text-sm font-medium">Selected Projects</label>
            {tooManyProjects && (
              <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                <AlertTriangle className="h-3 w-3" />
                Warning: More than {maxProjects} projects might make the resume too long.
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
                  <span className="text-xs text-muted-foreground line-clamp-2">{project.description}</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end border-t pt-4">
            <Button variant="ghost" size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Save Selection
            </Button>
        </div>
      </div>
    </div>
  );
};

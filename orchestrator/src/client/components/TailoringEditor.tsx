import React, { useEffect, useState } from "react";
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
}

export const TailoringEditor: React.FC<TailoringEditorProps> = ({ job, onUpdate }) => {
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [summary, setSummary] = useState(job.tailoredSummary || "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load project catalog
    api.getProfileProjects().then(setCatalog).catch(console.error);
    
    // Set initial selection
    if (job.selectedProjectIds) {
      setSelectedIds(new Set(job.selectedProjectIds.split(',').filter(Boolean)));
    }
  }, [job.selectedProjectIds]);

  useEffect(() => {
    setSummary(job.tailoredSummary || "");
  }, [job.tailoredSummary]);

  const handleToggleProject = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await api.updateJob(job.id, {
        tailoredSummary: summary,
        selectedProjectIds: Array.from(selectedIds).join(','),
      });
      toast.success("Changes saved");
      await onUpdate();
    } catch (error) {
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSummarize = async () => {
    try {
      setIsSummarizing(true);
      const updatedJob = await api.summarizeJob(job.id, { force: true });
      setSummary(updatedJob.tailoredSummary || "");
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
      setIsGeneratingPdf(true);
      // Save current state first to ensure PDF uses latest
      await api.updateJob(job.id, {
        tailoredSummary: summary,
        selectedProjectIds: Array.from(selectedIds).join(','),
      });
      
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
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Editor</h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSummarize}
            disabled={isSummarizing || isGeneratingPdf || isSaving}
          >
            {isSummarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            AI Summarize
          </Button>
          <Button
            size="sm"
            onClick={handleGeneratePdf}
            disabled={isSummarizing || isGeneratingPdf || isSaving || !summary}
          >
            {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Generate PDF
          </Button>
        </div>
      </div>
      
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
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
          <div className="flex items-center justify-between">
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

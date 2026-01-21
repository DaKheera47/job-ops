import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Edit2,
  ExternalLink,
  FileText,
  Loader2,
  MoreHorizontal,
  RefreshCcw,
  Save,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
import { copyTextToClipboard, formatJobForWebhook, safeFilenamePart, stripHtml } from "@/lib/utils";

import { DiscoveredPanel, FitAssessment, JobHeader, TailoredSummary } from "../../components";
import { ReadyPanel } from "../../components/ReadyPanel";
import { TailoringEditor } from "../../components/TailoringEditor";
import { useProfile } from "../../hooks/useProfile";
import * as api from "../../api";
import type { Job } from "../../../shared/types";
import type { FilterTab } from "./constants";

interface JobDetailPanelProps {
  activeTab: FilterTab;
  activeJobs: Job[];
  selectedJob: Job | null;
  onSelectJobId: (jobId: string | null) => void;
  onJobUpdated: () => Promise<void>;
  onSetActiveTab: (tab: FilterTab) => void;
}

export const JobDetailPanel: React.FC<JobDetailPanelProps> = ({
  activeTab,
  activeJobs,
  selectedJob,
  onSelectJobId,
  onJobUpdated,
  onSetActiveTab,
}) => {
  const [detailTab, setDetailTab] = useState<"overview" | "tailoring" | "description">("overview");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [hasUnsavedTailoring, setHasUnsavedTailoring] = useState(false);
  const [processingJobId, setProcessingJobId] = useState<string | null>(null);
  const saveTailoringRef = useRef<null | (() => Promise<void>)>(null);

  const { personName } = useProfile();

  useEffect(() => {
    setHasUnsavedTailoring(false);
    saveTailoringRef.current = null;
  }, [selectedJob?.id]);

  const description = useMemo(() => {
    if (!selectedJob?.jobDescription) return "No description available.";
    const jd = selectedJob.jobDescription;
    if (jd.includes("<") && jd.includes(">")) return stripHtml(jd);
    return jd;
  }, [selectedJob]);

  useEffect(() => {
    if (!selectedJob) {
      setIsEditingDescription(false);
      setEditedDescription("");
      return;
    }
    setIsEditingDescription(false);
    setEditedDescription(selectedJob.jobDescription || "");
  }, [selectedJob?.id]);

  useEffect(() => {
    if (!selectedJob) return;
    if (!isEditingDescription) {
      setEditedDescription(selectedJob.jobDescription || "");
    }
  }, [selectedJob?.jobDescription, isEditingDescription, selectedJob]);

  const handleSaveDescription = async () => {
    if (!selectedJob) return;
    try {
      setIsSavingDescription(true);
      await api.updateJob(selectedJob.id, { jobDescription: editedDescription });
      toast.success("Job description updated");
      setIsEditingDescription(false);
      await onJobUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update description";
      toast.error(message);
    } finally {
      setIsSavingDescription(false);
    }
  };

  const hasUnsavedDescription =
    !!selectedJob &&
    isEditingDescription &&
    editedDescription !== (selectedJob.jobDescription || "");

  const confirmAndSaveEdits = useCallback(
    async ({ includeTailoring = true }: { includeTailoring?: boolean } = {}) => {
      const pendingDescription = hasUnsavedDescription;
      const pendingTailoring = includeTailoring && hasUnsavedTailoring;

      if (!pendingDescription && !pendingTailoring) return true;

      const parts = [];
      if (pendingDescription) parts.push("job description");
      if (pendingTailoring) parts.push("tailoring changes");

      const message = `You have unsaved ${parts.join(" and ")}. Save before generating the PDF?`;
      if (!window.confirm(message)) return false;

      try {
        if (pendingDescription && selectedJob) {
          await api.updateJob(selectedJob.id, { jobDescription: editedDescription });
        }

        if (pendingTailoring) {
          const saveTailoring = saveTailoringRef.current;
          if (!saveTailoring) {
            toast.error("Could not save tailoring changes");
            return false;
          }
          await saveTailoring();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to save changes";
        toast.error(errorMessage);
        return false;
      }

      return true;
    },
    [editedDescription, hasUnsavedDescription, hasUnsavedTailoring, selectedJob],
  );

  const handleProcess = async () => {
    if (!selectedJob) return;
    try {
      const shouldProceed = await confirmAndSaveEdits({ includeTailoring: true });
      if (!shouldProceed) return;

      setProcessingJobId(selectedJob.id);

      if (selectedJob.status === "ready") {
        await api.generateJobPdf(selectedJob.id);
        toast.success("Resume regenerated successfully");
      } else {
        await api.processJob(selectedJob.id);
        toast.success("Resume generated successfully");
      }
      await onJobUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to process job";
      toast.error(message);
    } finally {
      setProcessingJobId(null);
    }
  };

  const handleApply = async () => {
    if (!selectedJob) return;
    try {
      await api.markAsApplied(selectedJob.id);
      toast.success("Marked as applied");
      await onJobUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark as applied";
      toast.error(message);
    }
  };

  const handleSkip = async () => {
    if (!selectedJob) return;
    try {
      await api.skipJob(selectedJob.id);
      toast.message("Job skipped");
      await onJobUpdated();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to skip job";
      toast.error(message);
    }
  };

  const handleCopyInfo = async () => {
    if (!selectedJob) return;
    try {
      await copyTextToClipboard(formatJobForWebhook(selectedJob));
      toast.success("Copied job info", { description: "Webhook payload copied to clipboard." });
    } catch {
      toast.error("Could not copy job info");
    }
  };

  const handleJobMoved = useCallback(
    (jobId: string) => {
      const currentIndex = activeJobs.findIndex((job) => job.id === jobId);
      const nextJob = activeJobs[currentIndex + 1] || activeJobs[currentIndex - 1];
      onSelectJobId(nextJob?.id ?? null);
    },
    [activeJobs, onSelectJobId],
  );

  const selectedHasPdf = !!selectedJob?.pdfPath;
  const selectedJobLink = selectedJob ? selectedJob.applicationLink || selectedJob.jobUrl : "#";
  const selectedPdfHref = selectedJob
    ? `/pdfs/resume_${selectedJob.id}.pdf?v=${encodeURIComponent(selectedJob.updatedAt)}`
    : "#";
  const canApply = selectedJob?.status === "ready";
  const canProcess = selectedJob ? ["discovered", "ready"].includes(selectedJob.status) : false;
  const canSkip = selectedJob ? ["discovered", "ready"].includes(selectedJob.status) : false;
  const showReadyPdf = activeTab === "ready";
  const showGeneratePdf = activeTab === "discovered";
  const isProcessingSelected =
    selectedJob ? processingJobId === selectedJob.id || selectedJob.status === "processing" : false;

  if (activeTab === "discovered") {
    return (
      <DiscoveredPanel
        job={selectedJob}
        onJobUpdated={onJobUpdated}
        onJobMoved={handleJobMoved}
      />
    );
  }

  if (activeTab === "ready") {
    return (
      <ReadyPanel
        job={selectedJob}
        onJobUpdated={onJobUpdated}
        onJobMoved={handleJobMoved}
      />
    );
  }

  if (!selectedJob) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-1 text-center">
        <div className="text-sm font-medium text-muted-foreground">No job selected</div>
        <p className="text-xs text-muted-foreground/70">Select a job to view details</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <JobHeader
        job={selectedJob}
        onCheckSponsor={async () => {
          await api.checkSponsor(selectedJob.id);
          await onJobUpdated();
        }}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-xs">
          <a href={selectedJobLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            View
          </a>
        </Button>

        {showReadyPdf &&
          (selectedHasPdf ? (
            <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-xs">
              <a href={selectedPdfHref} target="_blank" rel="noopener noreferrer">
                <FileText className="h-3.5 w-3.5" />
                PDF
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" disabled>
              <FileText className="h-3.5 w-3.5" />
              PDF
            </Button>
          ))}

        {showGeneratePdf && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={handleProcess}
            disabled={!canProcess || isProcessingSelected}
          >
            {isProcessingSelected ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
            {isProcessingSelected ? "Generating..." : "Generate"}
          </Button>
        )}

        {canApply && (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30"
            onClick={handleApply}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Applied
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canProcess && !showGeneratePdf && (
              <DropdownMenuItem
                onSelect={() => void handleProcess()}
                disabled={isProcessingSelected}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                {isProcessingSelected
                  ? "Processing..."
                  : selectedJob.status === "ready"
                    ? "Regenerate PDF"
                    : "Generate PDF"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                setDetailTab("description");
                setIsEditingDescription(true);
              }}
            >
              <Edit2 className="mr-2 h-4 w-4" />
              Edit description
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void handleCopyInfo()}>
              <Copy className="mr-2 h-4 w-4" />
              Copy info
            </DropdownMenuItem>
            {selectedHasPdf && (
              <>
                {!showReadyPdf && (
                  <DropdownMenuItem asChild>
                    <a href={selectedPdfHref} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View PDF
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <a
                    href={selectedPdfHref}
                    download={`${personName.replace(/\s+/g, '_')}_${safeFilenamePart(selectedJob.employer)}.pdf`}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Download PDF
                  </a>
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
      <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as typeof detailTab)}>
        <TabsList className="h-auto flex-wrap justify-start gap-1 text-xs">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="tailoring" className="text-xs">Tailoring</TabsTrigger>
          <TabsTrigger value="description" className="text-xs">Description</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 pt-2">
          <FitAssessment job={selectedJob} />
          <TailoredSummary job={selectedJob} />

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Discipline</div>
              <div className="text-foreground/80">{selectedJob.disciplines || "-"}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Function</div>
              <div className="text-foreground/80">{selectedJob.jobFunction || "-"}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Level</div>
              <div className="text-foreground/80">{selectedJob.jobLevel || "-"}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Type</div>
              <div className="text-foreground/80">{selectedJob.jobType || "-"}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              className="w-full text-left rounded border border-border/30 bg-muted/5 px-2.5 py-2 text-[11px] text-muted-foreground/80 line-clamp-4 whitespace-pre-wrap leading-relaxed hover:bg-muted/10 transition-colors"
              onClick={() => setDetailTab("description")}
            >
              {description}
            </button>
            <div className="text-center">
              <button
                type="button"
                className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                onClick={() => setDetailTab("description")}
              >
                View full description  
              </button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tailoring" className="pt-3">
          <TailoringEditor
            job={selectedJob}
            onUpdate={onJobUpdated}
            onDirtyChange={setHasUnsavedTailoring}
            onRegisterSave={(save) => {
              saveTailoringRef.current = save;
            }}
            onBeforeGenerate={() => confirmAndSaveEdits({ includeTailoring: false })}
          />
        </TabsContent>

        <TabsContent value="description" className="space-y-3 pt-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Job description
            </div>
            <div className="flex items-center gap-1">
              {!isEditingDescription ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditingDescription(true)}
                  className="h-8 px-2 text-xs"
                >
                  <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingDescription(false);
                      setEditedDescription(selectedJob.jobDescription || "");
                    }}
                    className="h-8 px-2 text-xs text-muted-foreground"
                    disabled={isSavingDescription}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleSaveDescription}
                    className="h-8 px-3 text-xs"
                    disabled={isSavingDescription}
                  >
                    {isSavingDescription ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Save Changes
                  </Button>
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Description actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      void copyTextToClipboard(selectedJob.jobDescription || "");
                      toast.success("Copied raw description");
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy raw text
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground">
            {isEditingDescription ? (
              <div className="space-y-3">
                <Textarea
                  value={editedDescription}
                  onChange={(event) => setEditedDescription(event.target.value)}
                  className="min-h-[400px] font-mono text-sm leading-relaxed focus-visible:ring-1"
                  placeholder="Enter job description..."
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
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
                    onClick={handleSaveDescription}
                    disabled={isSavingDescription}
                  >
                    {isSavingDescription ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Save Description
                  </Button>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

import React, { useCallback, useMemo, useState } from "react";
import {
  Activity,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  Play,
  Sparkles,
} from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Timeline9 } from "@/components/timeline9";
import { toast } from "sonner";
import { copyTextToClipboard } from "@client/lib/jobCopy";
import * as api from "../api";
import type { Job } from "../../shared/types";

type TimelineStatus = "done" | "in-progress" | "pending";

const sourceLabel: Record<Job["source"], string> = {
  gradcracker: "Gradcracker",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  ukvisajobs: "UK Visa Jobs",
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "Not yet";
  try {
    const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    const date = parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const time = parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
  } catch {
    return dateStr;
  }
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const statusDot = (status: TimelineStatus) => {
  switch (status) {
    case "done":
      return "bg-emerald-400";
    case "in-progress":
      return "bg-amber-400";
    case "pending":
    default:
      return "bg-muted-foreground/40";
  }
};

const statusText = (status: TimelineStatus) => {
  switch (status) {
    case "done":
      return "text-emerald-300";
    case "in-progress":
      return "text-amber-300";
    case "pending":
    default:
      return "text-muted-foreground/60";
  }
};

const statusBadge = (status: Job["status"]) => {
  switch (status) {
    case "applied":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "ready":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "processing":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "discovered":
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
    case "skipped":
    case "expired":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    default:
      return "border-muted-foreground/30 bg-muted/20 text-muted-foreground";
  }
};

interface JobTimelineModalProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJobUpdated?: () => void | Promise<void>;
  onShowFlow?: () => void;
}

export const JobTimelineModal: React.FC<JobTimelineModalProps> = ({
  job,
  open,
  onOpenChange,
  onJobUpdated,
  onShowFlow,
}) => {
  const [isMarkingEvent, setIsMarkingEvent] = useState(false);
  const [isCopyingApply, setIsCopyingApply] = useState(false);
  const [isCopyingSource, setIsCopyingSource] = useState(false);
  const [isCopyingDescription, setIsCopyingDescription] = useState(false);
  const applyLink = job?.applicationLink || job?.jobUrl || null;
  const sourceUrl = job?.jobUrlDirect || job?.jobUrl || null;
  const descriptionText = job?.jobDescription
    ? job.jobDescription.includes("<")
      ? stripHtml(job.jobDescription)
      : job.jobDescription
    : "";

  const handleMarkEvent = useCallback(async () => {
    if (!job || isMarkingEvent) return;
    if (job.status === "applied") {
      toast.message("Outcome events are not wired yet.");
      return;
    }
    try {
      setIsMarkingEvent(true);
      await api.markAsApplied(job.id);
      toast.success("Marked as applied");
      await onJobUpdated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark applied";
      toast.error(message);
    } finally {
      setIsMarkingEvent(false);
    }
  }, [job, isMarkingEvent, onJobUpdated]);

  const handleShowFlow = useCallback(() => {
    if (!onShowFlow) return;
    onShowFlow();
    onOpenChange(false);
  }, [onShowFlow, onOpenChange]);

  const handleCopyApplyLink = useCallback(async () => {
    if (!applyLink || isCopyingApply) return;
    try {
      setIsCopyingApply(true);
      await copyTextToClipboard(applyLink);
      toast.success("Apply link copied");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to copy apply link";
      toast.error(message);
    } finally {
      setIsCopyingApply(false);
    }
  }, [applyLink, isCopyingApply]);

  const handleCopySourceLink = useCallback(async () => {
    if (!sourceUrl || isCopyingSource) return;
    try {
      setIsCopyingSource(true);
      await copyTextToClipboard(sourceUrl);
      toast.success("Source link copied");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to copy source link";
      toast.error(message);
    } finally {
      setIsCopyingSource(false);
    }
  }, [sourceUrl, isCopyingSource]);

  const handleCopyDescription = useCallback(async () => {
    if (!descriptionText || isCopyingDescription) return;
    try {
      setIsCopyingDescription(true);
      await copyTextToClipboard(descriptionText);
      toast.success("Job description copied");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to copy description";
      toast.error(message);
    } finally {
      setIsCopyingDescription(false);
    }
  }, [descriptionText, isCopyingDescription]);

  const view = useMemo(() => {
    if (!job) return null;

    const inputsReady = Boolean(job.jobDescription && job.jobUrl);
    const generatedReady = Boolean(job.pdfPath);
    const appliedReady = Boolean(job.appliedAt);

    const stages = [
      { id: "inputs", label: "Inputs", status: inputsReady ? "done" : "in-progress" },
      { id: "generate", label: "Generate", status: generatedReady ? "done" : "pending" },
      { id: "apply", label: "Apply", status: appliedReady ? "done" : job.applicationLink ? "in-progress" : "pending" },
      { id: "outcomes", label: "Outcomes", status: appliedReady ? "in-progress" : "pending" },
    ] as const;

    const completedStages = stages.filter((stage) => stage.status === "done").length;
    const progress = Math.max(8, Math.round((completedStages / stages.length) * 100));

    const timeline = [
      {
        id: "discovered",
        title: "Discovered",
        subtitle: `Source: ${sourceLabel[job.source]}`,
        time: formatDateTime(job.discoveredAt),
        status: "done" as TimelineStatus,
      },
      {
        id: "resume",
        title: job.pdfPath ? "Tailored CV generated" : "Tailored CV pending",
        subtitle: job.pdfPath ? "PDF ready for download." : "Generate the PDF from the pipeline.",
        time: job.processedAt ? formatDateTime(job.processedAt) : "Not generated",
        status: job.pdfPath ? "done" : "pending",
      },
      {
        id: "applied",
        title: job.appliedAt ? "Applied" : "Apply in progress",
        subtitle: job.appliedAt ? "Application submitted." : "Open the application link to proceed.",
        time: job.appliedAt ? formatDateTime(job.appliedAt) : "Not applied",
        status: job.appliedAt ? "done" : job.applicationLink ? "in-progress" : "pending",
      },
      {
        id: "oa",
        title: "Got OA",
        subtitle: "Awaiting first assessment outcome.",
        time: "No outcome",
        status: "pending",
      },
    ];

    return { stages, completedStages, progress, timeline };
  }, [job]);

  if (!job || !view) return null;

  const pdfLink = job.pdfPath
    ? `/pdfs/resume_${job.id}.pdf?v=${encodeURIComponent(job.updatedAt)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,1200px)] p-0">
        <div className="flex h-[min(90vh,860px)] flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold">{job.title}</DialogTitle>
              <div className="text-xs text-muted-foreground">{job.employer}</div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
                  statusBadge(job.status)
                )}
              >
                {job.status}
              </span>
              <DialogClose asChild>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
                  Close
                </Button>
              </DialogClose>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-h-0 border-r border-border/60 bg-muted/5 px-5 py-4 flex flex-col">
              <div className="flex min-h-0 flex-col gap-4">
                <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground/90">
                        Pipeline summary: {job.appliedAt ? "Applied" : "In progress"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {view.completedStages}/{view.stages.length} stages complete
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={handleShowFlow}
                      disabled={!onShowFlow}
                    >
                      Show pipeline details
                    </Button>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-muted/40">
                    <div
                      className="h-2 rounded-full bg-emerald-500/70"
                      style={{ width: `${view.progress}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground/70">
                    {view.stages.map((stage) => (
                      <div key={stage.id} className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", statusDot(stage.status))} />
                        <span className={cn("uppercase tracking-wide", statusText(stage.status))}>
                          {stage.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground/90">Activity timeline</div>
                    <div className="text-xs text-muted-foreground">Latest actions for this job.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={!applyLink}
                      asChild={Boolean(applyLink)}
                    >
                      {applyLink ? (
                        <a href={applyLink} target="_blank" rel="noopener noreferrer">
                          Open apply link
                        </a>
                      ) : (
                        <span>Open apply link</span>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={!pdfLink}
                      asChild={Boolean(pdfLink)}
                    >
                      {pdfLink ? (
                        <a href={pdfLink} target="_blank" rel="noopener noreferrer">
                          View CV
                        </a>
                      ) : (
                        <span>View CV</span>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={handleMarkEvent}
                      disabled={isMarkingEvent}
                    >
                      {isMarkingEvent ? "Marking..." : "Mark event"}
                    </Button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                  <Timeline9
                    compact
                    showTitle={false}
                    className="py-0"
                    entries={view.timeline.map((event) => ({
                      date: event.time,
                      title: event.title,
                      content: <div className="text-xs text-muted-foreground/80">{event.subtitle}</div>,
                      dotClassName: statusDot(event.status),
                    }))}
                  />
                </div>
              </div>
            </section>

            <aside className="min-h-0 bg-background px-4 py-4">
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Artifacts
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold">Source & JD</div>
                          <div className="text-[11px] text-muted-foreground/70">{sourceLabel[job.source]}</div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground/60" />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          disabled={!sourceUrl}
                          asChild={Boolean(sourceUrl)}
                        >
                          {sourceUrl ? (
                            <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                              Open original
                            </a>
                          ) : (
                            <span>Open original</span>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={handleCopySourceLink}
                          disabled={!sourceUrl || isCopyingSource}
                        >
                          {isCopyingSource ? "Copying..." : "Copy URL"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={handleCopyDescription}
                          disabled={!descriptionText || isCopyingDescription}
                        >
                          {isCopyingDescription ? "Copying..." : "Copy JD"}
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold">{job.title}</div>
                          <div className="text-[11px] text-muted-foreground/70">{job.location || "Location unknown"}</div>
                        </div>
                        <Calendar className="h-4 w-4 text-muted-foreground/60" />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sponsor check
                  </div>
                  <div className="mt-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      <div className="font-semibold">Unknown sponsor</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">
                      Home Office register not checked.
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Documents
                  </div>
                  <div className="mt-2 space-y-2">
                    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs">
                          <FileText className="h-4 w-4 text-muted-foreground/70" />
                          <div>
                            <div className="font-semibold">Tailored CV</div>
                            <div className="text-[11px] text-muted-foreground/70">
                              {job.pdfPath ? "Generated" : "Not generated"}
                            </div>
                          </div>
                        </div>
                        {job.pdfPath ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Play className="h-4 w-4 text-muted-foreground/60" />
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs">
                          <Sparkles className="h-4 w-4 text-muted-foreground/70" />
                          <div>
                            <div className="font-semibold">Cover letter</div>
                            <div className="text-[11px] text-muted-foreground/70">Optional</div>
                          </div>
                        </div>
                        <Activity className="h-4 w-4 text-muted-foreground/60" />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Apply URL
                  </div>
                  <div className="mt-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="font-semibold">Open application</div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground/60" />
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 mt-1">
                      {job.applicationLink ? "Final application URL saved." : "Using listing URL."}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={!applyLink}
                        asChild={Boolean(applyLink)}
                      >
                        {applyLink ? (
                          <a href={applyLink} target="_blank" rel="noopener noreferrer">
                            Open link
                          </a>
                        ) : (
                          <span>Open link</span>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        onClick={handleCopyApplyLink}
                        disabled={!applyLink || isCopyingApply}
                      >
                        {isCopyingApply ? "Copying..." : "Copy link"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

import {
  type ApplicationStage,
  type ApplicationTask,
  type Job,
  type JobNote,
  type JobOutcome,
  type ResumeProjectCatalogItem,
  STAGE_LABELS,
  type StageEvent,
} from "@shared/types.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  ClipboardList,
  DollarSign,
  ExternalLink,
  FileText,
  MessageSquareText,
  PlusCircle,
  Sparkles,
  Upload,
} from "lucide-react";
import React from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
import { JobDescriptionMarkdown } from "@/client/components/JobDescriptionMarkdown";
import { invalidateJobData } from "@/client/hooks/queries/invalidate";
import {
  useCheckSponsorMutation,
  useGenerateJobPdfMutation,
  useMarkAsAppliedMutation,
  useRescoreJobMutation,
  useSkipJobMutation,
  useUpdateJobMutation,
} from "@/client/hooks/queries/useJobMutations";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { showErrorToast } from "@/client/lib/error-toast";
import { uploadJobPdfFromFile } from "@/client/lib/job-pdf-upload";
import { getRenderableJobDescription } from "@/client/lib/jobDescription";
import { openJobPdf } from "@/client/lib/private-pdf";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  copyTextToClipboard,
  formatDateTime,
  formatJobForWebhook,
  formatTimestamp,
  sourceLabel as sourceLabels,
} from "@/lib/utils";
import * as api from "../api";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { GhostwriterPanel } from "../components/ghostwriter/GhostwriterPanel";
import { JobDetailsEditDrawer } from "../components/JobDetailsEditDrawer";
import {
  type LogEventFormValues,
  LogEventModal,
} from "../components/LogEventModal";
import { JobTimeline } from "./job/Timeline";
import { JobNotesCard } from "./job-page/JobNotesCard";
import {
  type JobMemoryView,
  JobPageLeftSidebar,
} from "./job-page/JobPageLeftSidebar";
import { JobPageRightSidebar } from "./job-page/JobPageRightSidebar";
import { OverviewGhostwriterComposer } from "./job-page/OverviewGhostwriterComposer";

const normalizeMemoryView = (view: string | undefined): JobMemoryView => {
  if (view === "notes" || view === "note") return "note";
  if (view === "documents" || view === "timeline" || view === "ghostwriter") {
    return view;
  }
  return "overview";
};

type JobPageLocationState = {
  jobPageBackTo?: string;
};

const isValidJobPageBackTarget = (value: unknown): value is string =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("/job/");

const getFallbackBackTarget = (job: Job | null): string => {
  if (job?.status === "ready" || job?.status === "discovered") {
    return `/jobs/${job.status}`;
  }
  if (job?.status === "applied") {
    return "/jobs/applied";
  }
  if (job?.status === "in_progress") {
    return "/applications/in-progress";
  }
  return "/jobs/all";
};

const sortNotesByUpdatedAtDesc = (notes: JobNote[]) =>
  [...notes].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

const parseSelectedProjectIds = (value: string | null | undefined) =>
  value
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean) ?? [];

export const JobPage: React.FC = () => {
  const { id, view } = useParams<{ id: string; view?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [isLogModalOpen, setIsLogModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isEditDetailsOpen, setIsEditDetailsOpen] = React.useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = React.useState(false);
  const [activeAction, setActiveAction] = React.useState<string | null>(null);
  const [eventToDelete, setEventToDelete] = React.useState<string | null>(null);
  const [editingEvent, setEditingEvent] = React.useState<StageEvent | null>(
    null,
  );
  const [catalog, setCatalog] = React.useState<ResumeProjectCatalogItem[]>([]);
  const pendingEventRef = React.useRef<StageEvent | null>(null);
  const uploadPdfInputRef = React.useRef<HTMLInputElement | null>(null);
  const openEditDetails = React.useCallback(() => {
    window.setTimeout(() => setIsEditDetailsOpen(true), 0);
  }, []);

  const jobQuery = useQuery<Job | null>({
    queryKey: ["jobs", "detail", id ?? null] as const,
    queryFn: () => (id ? api.getJob(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });
  const eventsQuery = useQuery<StageEvent[]>({
    queryKey: ["jobs", "stage-events", id ?? null] as const,
    queryFn: () => (id ? api.getJobStageEvents(id) : Promise.resolve([])),
    enabled: Boolean(id),
  });
  const notesQuery = useQuery<JobNote[]>({
    queryKey: queryKeys.jobs.notes(id ?? ""),
    queryFn: () => (id ? api.getJobNotes(id) : Promise.resolve([])),
    enabled: Boolean(id),
  });
  const tasksQuery = useQuery<ApplicationTask[]>({
    queryKey: ["jobs", "tasks", id ?? null] as const,
    queryFn: () => (id ? api.getJobTasks(id) : Promise.resolve([])),
    enabled: Boolean(id),
  });

  useQueryErrorToast(
    jobQuery.error,
    "Failed to load job details. Please try again.",
  );
  useQueryErrorToast(
    eventsQuery.error,
    "Failed to load job timeline. Please try again.",
  );
  useQueryErrorToast(
    tasksQuery.error,
    "Failed to load job tasks. Please try again.",
  );

  const markAsAppliedMutation = useMarkAsAppliedMutation();
  const updateJobMutation = useUpdateJobMutation();
  const skipJobMutation = useSkipJobMutation();
  const rescoreJobMutation = useRescoreJobMutation();
  const generatePdfMutation = useGenerateJobPdfMutation();
  const checkSponsorMutation = useCheckSponsorMutation();

  const job = jobQuery.data ?? null;
  const events = mergeEvents(eventsQuery.data ?? [], pendingEventRef.current);
  const notes = React.useMemo(
    () => sortNotesByUpdatedAtDesc(notesQuery.data ?? []),
    [notesQuery.data],
  );
  const tasks = tasksQuery.data ?? [];
  const isLoading =
    jobQuery.isLoading || eventsQuery.isLoading || tasksQuery.isLoading;
  const activeMemoryView = normalizeMemoryView(view);
  useQueryErrorToast(
    activeMemoryView === "note" ? null : notesQuery.error,
    "Failed to load notes. Please try again.",
  );
  const selectedProjectIds = React.useMemo(
    () => parseSelectedProjectIds(job?.selectedProjectIds),
    [job?.selectedProjectIds],
  );
  const selectedProjectIdsKey = selectedProjectIds.join(",");
  const selectedProjects = React.useMemo(
    () =>
      selectedProjectIds.map(
        (projectId) =>
          catalog.find((project) => project.id === projectId)?.name ??
          projectId,
      ),
    [catalog, selectedProjectIds],
  );
  const sourceLabel = job ? sourceLabels[job.source] : "";
  const jobPageBackTo = React.useMemo(() => {
    const state = location.state as JobPageLocationState | null;
    return isValidJobPageBackTarget(state?.jobPageBackTo)
      ? state.jobPageBackTo
      : null;
  }, [location.state]);
  const jobPageNavigationState = React.useMemo(
    () => (jobPageBackTo ? { jobPageBackTo } : undefined),
    [jobPageBackTo],
  );

  React.useEffect(() => {
    if (!id || view !== "note") return;
    const search = location.search;
    navigate(`/job/${id}/notes${search}`, {
      replace: true,
      state: jobPageNavigationState,
    });
  }, [id, jobPageNavigationState, location.search, navigate, view]);

  React.useEffect(() => {
    let isCancelled = false;

    if (selectedProjectIdsKey.length === 0) {
      setCatalog([]);
      return () => {
        isCancelled = true;
      };
    }

    void api
      .getResumeProjectsCatalog()
      .then((nextCatalog) => {
        if (!isCancelled) {
          setCatalog(nextCatalog);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCatalog([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedProjectIdsKey]);

  const loadData = React.useCallback(async () => {
    if (!id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(id) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.jobs.stageEvents(id),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.tasks(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs.notes(id) }),
    ]);
  }, [id, queryClient]);

  const handleLogEvent = async (
    values: LogEventFormValues,
    eventId?: string,
  ) => {
    if (!job) return;
    if (job.status !== "in_progress") {
      toast.error("Move this job to In Progress to track stages.");
      return;
    }

    let toStage: ApplicationStage | "no_change" = values.stage as
      | ApplicationStage
      | "no_change";
    let outcome: JobOutcome | null = null;

    if (values.stage === "rejected") {
      toStage = "closed";
      outcome = "rejected";
    } else if (values.stage === "withdrawn") {
      toStage = "closed";
      outcome = "withdrawn";
    }

    const currentStage = events.at(-1)?.toStage ?? "applied";
    const effectiveStage =
      toStage === "no_change" ? (currentStage ?? "applied") : toStage;

    try {
      if (eventId) {
        await api.updateJobStageEvent(job.id, eventId, {
          toStage: toStage === "no_change" ? undefined : toStage,
          occurredAt: toTimestamp(values.date) ?? undefined,
          metadata: {
            note: values.notes?.trim() || undefined,
            eventLabel: values.title.trim() || undefined,
            reasonCode:
              values.reasonCode ||
              (values.stage === "no_change"
                ? undefined
                : "job_page_manual_stage"),
            actor: "user",
            eventType: values.stage === "no_change" ? "note" : "status_update",
            externalUrl: values.salary ? `Salary: ${values.salary}` : undefined,
          },
          outcome,
        });
      } else {
        const newEvent = await api.transitionJobStage(job.id, {
          toStage: effectiveStage,
          occurredAt: toTimestamp(values.date),
          metadata: {
            note: values.notes?.trim() || undefined,
            eventLabel: values.title.trim() || undefined,
            reasonCode:
              values.reasonCode ||
              (values.stage === "no_change"
                ? undefined
                : "job_page_manual_stage"),
            actor: "user",
            eventType: values.stage === "no_change" ? "note" : "status_update",
            externalUrl: values.salary ? `Salary: ${values.salary}` : undefined,
          },
          outcome,
        });
        pendingEventRef.current = newEvent;
      }

      await invalidateJobData(queryClient, job.id);
      pendingEventRef.current = null;
      setEditingEvent(null);
      toast.success(eventId ? "Event updated" : "Event logged");

      if (effectiveStage === "offer") {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#10b981", "#34d399", "#6ee7b7", "#ffffff"],
        });
      }
    } catch (error) {
      showErrorToast(error, "Failed to log event");
    }
  };

  const confirmDeleteEvent = (eventId: string) => {
    setEventToDelete(eventId);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteEvent = async () => {
    if (!job || !eventToDelete) return;
    try {
      await api.deleteJobStageEvent(job.id, eventToDelete);
      await invalidateJobData(queryClient, job.id);
      toast.success("Event deleted");
    } catch (error) {
      showErrorToast(error, "Failed to delete event");
    } finally {
      setIsDeleteModalOpen(false);
      setEventToDelete(null);
    }
  };

  const handleEditEvent = (event: StageEvent) => {
    setEditingEvent(event);
    setIsLogModalOpen(true);
  };

  const runAction = React.useCallback(
    async (actionKey: string, task: () => Promise<void>) => {
      if (!job) return;
      try {
        setActiveAction(actionKey);
        await task();
        await loadData();
      } catch (error) {
        showErrorToast(error, "Failed to run action");
      } finally {
        setActiveAction(null);
      }
    },
    [job, loadData],
  );

  const handleMarkApplied = async () => {
    await runAction("mark-applied", async () => {
      if (!job) return;
      await markAsAppliedMutation.mutateAsync(job.id);
      toast.success("Marked as applied");
    });
  };

  const handleMoveToInProgress = async () => {
    await runAction("move-in-progress", async () => {
      if (!job) return;
      await updateJobMutation.mutateAsync({
        id: job.id,
        update: { status: "in_progress" },
      });
      toast.success("Moved to in progress");
    });
  };

  const handleSkip = async () => {
    await runAction("skip", async () => {
      if (!job) return;
      await skipJobMutation.mutateAsync(job.id);
      toast.message("Job skipped");
    });
  };

  const handleRescore = async () => {
    await runAction("rescore", async () => {
      if (!job) return;
      await rescoreJobMutation.mutateAsync(job.id);
      toast.success("Match recalculated");
    });
  };

  const handleRegeneratePdf = async () => {
    await runAction("regenerate-pdf", async () => {
      if (!job) return;
      await generatePdfMutation.mutateAsync(job.id);
      toast.success("Resume PDF generated");
    });
  };

  const handleCheckSponsor = async () => {
    await runAction("check-sponsor", async () => {
      if (!job) return;
      await checkSponsorMutation.mutateAsync(job.id);
      toast.success("Sponsor check completed");
    });
  };

  const handleCopyJobInfo = async () => {
    if (!job) return;
    try {
      await copyTextToClipboard(formatJobForWebhook(job));
      toast.success("Copied job info", {
        description: "Webhook payload copied to clipboard.",
      });
    } catch {
      toast.error("Could not copy job info");
    }
  };

  const handleUploadPdf = async (file: File) => {
    if (!job) return;

    try {
      setIsUploadingPdf(true);
      await uploadJobPdfFromFile(job.id, file);
      await loadData();
      toast.success(
        job.pdfPath ? "Resume PDF replaced" : "Resume PDF attached",
      );
    } catch (error) {
      showErrorToast(error, "Failed to upload resume PDF");
    } finally {
      setIsUploadingPdf(false);
      if (uploadPdfInputRef.current) {
        uploadPdfInputRef.current.value = "";
      }
    }
  };

  const currentStage = job
    ? (events.at(-1)?.toStage ??
      (job.status === "applied" || job.status === "in_progress"
        ? "applied"
        : null))
    : null;
  const isClosedStage = currentStage === "closed";
  const canTrackStages = job?.status === "in_progress";
  const canLogEvents = canTrackStages && !isClosedStage;
  const jobLink = job ? job.applicationLink || job.jobUrl : null;
  const isBusy = activeAction !== null;
  const isDiscovered = job?.status === "discovered";
  const isReady = job?.status === "ready";
  const isApplied = job?.status === "applied";
  const isInProgress = job?.status === "in_progress";
  const baseJobPath = id ? `/job/${id}` : "";
  const latestNote = notes[0] ?? null;
  const latestEvent = events.at(-1) ?? null;
  const latestEventTitle =
    latestEvent?.metadata?.eventLabel || latestEvent?.title || null;
  const jobDescriptionPreview = summarizeMemoryText(job?.jobDescription, 260);
  const latestNotePreview = summarizeMemoryText(latestNote?.content, 180);
  const initialGhostwriterPrompt =
    activeMemoryView === "ghostwriter" ? searchParams.get("prompt") : null;
  const clearInitialGhostwriterPrompt = React.useCallback(() => {
    navigate(`${baseJobPath}/ghostwriter`, {
      replace: true,
      state: jobPageNavigationState,
    });
  }, [baseJobPath, jobPageNavigationState, navigate]);
  const handleBack = React.useCallback(() => {
    navigate(jobPageBackTo ?? getFallbackBackTarget(job));
  }, [job, jobPageBackTo, navigate]);
  const pageGridClass =
    activeMemoryView === "overview"
      ? "grid items-start gap-4 grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)_18rem]"
      : "grid items-start gap-4 grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)]";

  if (!id) {
    return null;
  }

  return (
    <main className="mx-auto max-w-[92rem] px-4 py-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {job && (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          >
            {currentStage
              ? STAGE_LABELS[currentStage as ApplicationStage] || currentStage
              : job.status}
          </Badge>
        )}
      </div>

      {!job && (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-sm text-muted-foreground">
          {isLoading ? "Loading application..." : "Application not found."}
        </div>
      )}

      {job && (
        <div className={pageGridClass}>
          <JobPageLeftSidebar
            job={job}
            activeMemoryView={activeMemoryView}
            baseJobPath={baseJobPath}
            navigationState={jobPageNavigationState}
            selectedProjects={selectedProjects}
            sourceLabel={sourceLabel}
          />

          <div className="space-y-4">
            {activeMemoryView === "overview" && (
              <section className="space-y-4">
                <OverviewGhostwriterComposer
                  job={job}
                  baseJobPath={baseJobPath}
                  hasNotes={notes.length > 0}
                  navigationState={jobPageNavigationState}
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <article className="rounded-xl border border-border/50 bg-card/75 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <MessageSquareText className="h-4 w-4 text-primary" />
                        Notes
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {notesQuery.isLoading
                          ? "Loading"
                          : `${notes.length} saved`}
                      </Badge>
                    </div>
                    <div className="mt-4 min-h-[5.5rem] rounded-lg border border-border/50 bg-background/25 p-3">
                      {latestNote ? (
                        <div>
                          <div className="text-sm font-medium">
                            {latestNote.title}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Updated{" "}
                            {formatDateTime(latestNote.updatedAt) ??
                              latestNote.updatedAt}
                          </div>
                          {latestNotePreview && (
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                              {latestNotePreview}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No notes or transcripts captured yet.
                        </div>
                      )}
                    </div>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="mt-4 w-full justify-between"
                    >
                      <Link
                        to={`${baseJobPath}/notes`}
                        state={jobPageNavigationState}
                      >
                        Open notes
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </article>

                  <article className="rounded-xl border border-border/50 bg-card/75 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <FileText className="h-4 w-4 text-primary" />
                        Documents
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {job.pdfPath ? "Resume ready" : "No resume PDF"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/50 bg-background/25 p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Resume PDF
                        </div>
                        <div className="mt-2 text-sm font-medium">
                          {job.pdfPath ? "Stored for this job" : "Missing"}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/25 p-3">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Job description
                        </div>
                        <div className="mt-2 text-sm font-medium">
                          {job.jobDescription ? "Saved" : "Missing"}
                        </div>
                      </div>
                    </div>
                    {jobDescriptionPreview && (
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {jobDescriptionPreview}
                      </p>
                    )}
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="mt-4 w-full justify-between"
                    >
                      <Link
                        to={`${baseJobPath}/documents`}
                        state={jobPageNavigationState}
                      >
                        Open documents
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </article>

                  <article className="rounded-xl border border-border/50 bg-card/75 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        Timeline
                      </div>
                      {currentStage && (
                        <Badge variant="secondary" className="text-[10px]">
                          {STAGE_LABELS[currentStage as ApplicationStage] ||
                            currentStage}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-4 min-h-[5.5rem] rounded-lg border border-border/50 bg-background/25 p-3">
                      {latestEvent ? (
                        <div>
                          <div className="text-sm font-medium">
                            {latestEventTitle}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatTimestamp(latestEvent.occurredAt)}
                          </div>
                          {latestEvent.metadata?.note && (
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                              {summarizeMemoryText(
                                latestEvent.metadata.note,
                                160,
                              )}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No timeline events yet.
                        </div>
                      )}
                    </div>
                    {canLogEvents ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4 w-full justify-between"
                        onClick={() => setIsLogModalOpen(true)}
                      >
                        <span className="flex items-center gap-2">
                          <PlusCircle className="h-3.5 w-3.5" />
                          Log event
                        </span>
                      </Button>
                    ) : (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="mt-4 w-full justify-between"
                      >
                        <Link
                          to={`${baseJobPath}/timeline`}
                          state={jobPageNavigationState}
                        >
                          Open timeline
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </article>
                </div>
              </section>
            )}

            {activeMemoryView === "note" && job.id && (
              <JobNotesCard jobId={job.id} />
            )}

            {activeMemoryView === "documents" && (
              <section className="rounded-xl border border-border/50 bg-card/75">
                <div className="border-b border-border/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <FileText className="h-4 w-4" />
                    Documents
                  </div>
                </div>
                <div className="space-y-4 p-4">
                  <div className="rounded-lg border border-border/60 bg-background/25 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">Resume PDF</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Generated or uploaded application material for this
                          job.
                        </div>
                      </div>
                      {job.pdfPath ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void openJobPdf(job.id).catch((error) => {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Could not open PDF",
                              );
                            });
                          }}
                        >
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          View PDF
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => uploadPdfInputRef.current?.click()}
                          disabled={isUploadingPdf}
                        >
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Upload PDF
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/25">
                    <div className="border-b border-border/50 px-4 py-3">
                      <div className="text-sm font-semibold">
                        Job description
                      </div>
                    </div>
                    <div className="p-4">
                      {job.jobDescription ? (
                        <JobDescriptionMarkdown
                          description={getRenderableJobDescription(
                            job.jobDescription,
                          )}
                        />
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No job description stored.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeMemoryView === "timeline" && (
              <section className="rounded-xl border border-border/50 bg-card/85">
                <div className="border-b border-border/50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-base font-semibold">
                      <ClipboardList className="h-4 w-4" />
                      Timeline
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {job.salary && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        >
                          <DollarSign className="mr-1 h-3.5 w-3.5" />
                          {job.salary}
                        </Badge>
                      )}
                      {currentStage && (
                        <Badge variant="secondary">
                          {STAGE_LABELS[currentStage as ApplicationStage] ||
                            currentStage}
                        </Badge>
                      )}
                      {canLogEvents && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => setIsLogModalOpen(true)}
                        >
                          <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                          Log event
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  {!canTrackStages && (
                    <div className="mb-4 rounded-md border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
                      Move this job to In Progress to track application stages.
                    </div>
                  )}
                  {canTrackStages && isClosedStage && (
                    <div className="mb-4 rounded-md border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
                      This application is closed. Stage logging is disabled.
                    </div>
                  )}
                  <JobTimeline
                    events={events}
                    onEdit={canLogEvents ? handleEditEvent : undefined}
                    onDelete={canLogEvents ? confirmDeleteEvent : undefined}
                  />
                </div>
              </section>
            )}

            {activeMemoryView === "ghostwriter" && (
              <section className="">
                <div className="border-b border-border/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <Sparkles className="h-4 w-4" />
                    Ghostwriter
                  </div>
                </div>
                <div className="h-[calc(100vh-140px)] px-4">
                  <GhostwriterPanel
                    job={job}
                    initialPrompt={initialGhostwriterPrompt}
                    onInitialPromptConsumed={clearInitialGhostwriterPrompt}
                  />
                </div>
              </section>
            )}
          </div>

          {activeMemoryView === "overview" && (
            <JobPageRightSidebar
              job={job}
              tasks={tasks}
              jobLink={jobLink}
              isDiscovered={Boolean(isDiscovered)}
              isReady={Boolean(isReady)}
              isApplied={Boolean(isApplied)}
              isInProgress={Boolean(isInProgress)}
              canLogEvents={canLogEvents}
              isBusy={isBusy}
              isUploadingPdf={isUploadingPdf}
              onStartTailoring={() => navigate(`/jobs/discovered/${job.id}`)}
              onMarkApplied={() => void handleMarkApplied()}
              onMoveToInProgress={() => void handleMoveToInProgress()}
              onOpenLogEvent={() => setIsLogModalOpen(true)}
              onEditTailoring={() => navigate(`/jobs/ready/${job.id}`)}
              onViewPdf={() => {
                void openJobPdf(job.id).catch((error) => {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not open PDF",
                  );
                });
              }}
              onUploadPdf={() => uploadPdfInputRef.current?.click()}
              onRegeneratePdf={() => void handleRegeneratePdf()}
              onSkip={() => void handleSkip()}
              onOpenEditDetails={openEditDetails}
              onCopyJobInfo={() => void handleCopyJobInfo()}
              onRescore={() => void handleRescore()}
              onCheckSponsor={() => void handleCheckSponsor()}
            />
          )}
        </div>
      )}

      <LogEventModal
        isOpen={isLogModalOpen}
        onClose={() => {
          setIsLogModalOpen(false);
          setEditingEvent(null);
        }}
        onLog={handleLogEvent}
        editingEvent={editingEvent}
      />

      <ConfirmDelete
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setEventToDelete(null);
        }}
        onConfirm={handleDeleteEvent}
      />

      <JobDetailsEditDrawer
        open={isEditDetailsOpen}
        onOpenChange={setIsEditDetailsOpen}
        job={job}
        onJobUpdated={loadData}
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
    </main>
  );
};

const toTimestamp = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
};

const mergeEvents = (events: StageEvent[], pending: StageEvent | null) => {
  if (!pending) return events;
  if (events.some((event) => event.id === pending.id)) return events;
  return [...events, pending].sort((a, b) => a.occurredAt - b.occurredAt);
};

const summarizeMemoryText = (
  value: string | null | undefined,
  maxLength: number,
) => {
  const text = getRenderableJobDescription(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[#*_`>[\](){}-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
};

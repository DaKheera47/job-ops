import {
  type ApplicationStage,
  type ApplicationTask,
  type Job,
  type JobNote,
  type JobOutcome,
  STAGE_LABELS,
  type StageEvent,
} from "@shared/types.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Copy,
  DollarSign,
  Edit2,
  ExternalLink,
  FileText,
  MoreHorizontal,
  PlusCircle,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { RichTextEditor } from "@/client/components/design-resume/RichTextEditor";
import { JobDescriptionMarkdown } from "@/client/components/JobDescriptionMarkdown";
import { invalidateJobData } from "@/client/hooks/queries/invalidate";
import {
  useCheckSponsorMutation,
  useCreateJobNoteMutation,
  useDeleteJobNoteMutation,
  useGenerateJobPdfMutation,
  useMarkAsAppliedMutation,
  useRescoreJobMutation,
  useSkipJobMutation,
  useUpdateJobMutation,
  useUpdateJobNoteMutation,
} from "@/client/hooks/queries/useJobMutations";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { uploadJobPdfFromFile } from "@/client/lib/job-pdf-upload";
import { getRenderableJobDescription } from "@/client/lib/jobDescription";
import {
  markdownToEditorHtml as markdownToTipTapHtml,
  editorHtmlToMarkdown as tipTapHtmlToMarkdown,
} from "@/client/lib/jobNoteContent";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  cn,
  copyTextToClipboard,
  formatDateTime,
  formatJobForWebhook,
  formatTimestamp,
} from "@/lib/utils";
import * as api from "../api";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { GhostwriterDrawer } from "../components/ghostwriter/GhostwriterDrawer";
import { JobDetailsEditDrawer } from "../components/JobDetailsEditDrawer";
import { JobHeader } from "../components/JobHeader";
import {
  type LogEventFormValues,
  LogEventModal,
} from "../components/LogEventModal";
import { JobTimeline } from "./job/Timeline";

const sortNotesByUpdatedAtDesc = (notes: JobNote[]) =>
  [...notes].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

const JobNotesCard: React.FC<{ jobId: string }> = ({ jobId }) => {
  const [editorState, setEditorState] = React.useState<
    { mode: "create" } | { mode: "edit"; noteId: string } | null
  >(null);
  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(
    null,
  );
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftContent, setDraftContent] = React.useState("");
  const [editorError, setEditorError] = React.useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = React.useState<JobNote | null>(null);

  const notesQuery = useQuery<JobNote[]>({
    queryKey: queryKeys.jobs.notes(jobId),
    queryFn: () => api.getJobNotes(jobId),
    enabled: Boolean(jobId),
  });
  const createNoteMutation = useCreateJobNoteMutation();
  const updateNoteMutation = useUpdateJobNoteMutation();
  const deleteNoteMutation = useDeleteJobNoteMutation();

  useQueryErrorToast(
    notesQuery.error,
    "Failed to load notes. Please try again.",
  );

  const notes = React.useMemo(
    () => sortNotesByUpdatedAtDesc(notesQuery.data ?? []),
    [notesQuery.data],
  );
  const selectedNote = React.useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? notes[0] ?? null,
    [notes, selectedNoteId],
  );
  const isSaving = createNoteMutation.isPending || updateNoteMutation.isPending;
  const isDeleting = deleteNoteMutation.isPending;

  const resetEditor = React.useCallback(() => {
    setEditorState(null);
    setDraftTitle("");
    setDraftContent("");
    setEditorError(null);
  }, []);

  const openCreateEditor = React.useCallback(() => {
    setEditorState({ mode: "create" });
    setSelectedNoteId(null);
    setDraftTitle("");
    setDraftContent("");
    setEditorError(null);
  }, []);

  const openEditEditor = React.useCallback((note: JobNote) => {
    setEditorState({ mode: "edit", noteId: note.id });
    setDraftTitle(note.title);
    setDraftContent(markdownToTipTapHtml(note.content));
    setEditorError(null);
    setSelectedNoteId(note.id);
  }, []);

  const confirmDeleteNote = React.useCallback((note: JobNote) => {
    setNoteToDelete(note);
  }, []);

  const saveNote = React.useCallback(async () => {
    const title = draftTitle.trim();
    const content = tipTapHtmlToMarkdown(draftContent).trim();

    if (!title || !content) {
      setEditorError("Title and note content are required.");
      return;
    }

    try {
      const savedNote =
        editorState?.mode === "edit"
          ? await updateNoteMutation.mutateAsync({
              jobId,
              noteId: editorState.noteId,
              input: { title, content },
            })
          : await createNoteMutation.mutateAsync({
              jobId,
              input: { title, content },
            });

      toast.success("Note saved");
      setSelectedNoteId(savedNote.id);
      resetEditor();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save note";
      toast.error(message);
    }
  }, [
    createNoteMutation,
    draftContent,
    draftTitle,
    editorState,
    jobId,
    resetEditor,
    updateNoteMutation,
  ]);

  const handleDeleteNote = React.useCallback(async () => {
    if (!noteToDelete) return;

    try {
      await deleteNoteMutation.mutateAsync({
        jobId,
        noteId: noteToDelete.id,
      });
      toast.success("Note deleted");
      if (selectedNoteId === noteToDelete.id) {
        const nextNote = notes.find((note) => note.id !== noteToDelete.id);
        setSelectedNoteId(nextNote?.id ?? null);
      }
      if (
        editorState?.mode === "edit" &&
        editorState.noteId === noteToDelete.id
      ) {
        resetEditor();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete note";
      toast.error(message);
    } finally {
      setNoteToDelete(null);
    }
  }, [
    deleteNoteMutation,
    editorState,
    jobId,
    noteToDelete,
    notes,
    resetEditor,
    selectedNoteId,
  ]);

  const canEditOtherNotes = editorState === null;

  React.useEffect(() => {
    if (editorState) return;
    if (notes.length === 0) {
      setSelectedNoteId(null);
      return;
    }

    if (!selectedNoteId || !notes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(notes[0]?.id ?? null);
    }
  }, [editorState, notes, selectedNoteId]);

  const startViewingNote = React.useCallback(
    (note: JobNote) => {
      if (editorState) return;
      setSelectedNoteId(note.id);
    },
    [editorState],
  );

  const selectedTimestamp = selectedNote
    ? (formatDateTime(selectedNote.updatedAt) ?? selectedNote.updatedAt)
    : null;

  return (
    <section data-testid="job-notes-section" className="w-full">
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Notes
            </CardTitle>
            {!editorState && (
              <Button size="sm" variant="outline" onClick={openCreateEditor}>
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                Add note
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.3fr)]">
            <aside data-testid="job-notes-list" className="space-y-3">
              {!editorState && notesQuery.isLoading && notes.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                  Loading notes...
                </div>
              )}

              {!editorState && !notesQuery.isLoading && notes.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                  No notes yet. Capture reminders, interview prep, or links in
                  markdown.
                </div>
              )}

              {notes.length > 0 && (
                <div className="space-y-2">
                  {notes.map((note) => {
                    const noteTimestamp =
                      formatDateTime(note.updatedAt) ?? note.updatedAt;
                    const isSelected = note.id === selectedNoteId;
                    return (
                      <button
                        key={note.id}
                        type="button"
                        className={cn(
                          "w-full rounded-xl border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-primary/40 bg-primary/5 shadow-sm"
                            : "border-border/60 bg-background/70 hover:border-border hover:bg-muted/40",
                          editorState && "cursor-default opacity-70",
                        )}
                        onClick={() => startViewingNote(note)}
                        disabled={Boolean(editorState)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {note.title}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Updated {noteTimestamp}
                            </div>
                          </div>
                          {isSelected && !editorState && (
                            <Badge variant="secondary" className="text-[10px]">
                              Selected
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>

            <div
              data-testid="job-notes-detail"
              className="min-w-0 rounded-2xl border border-border/60 bg-muted/10 p-4 shadow-sm"
            >
              {editorState ? (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveNote();
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                        {editorState.mode === "create"
                          ? "New note"
                          : "Editing note"}
                      </div>
                      <div className="mt-1 text-lg font-semibold">
                        {editorState.mode === "create"
                          ? "Draft a note"
                          : draftTitle || selectedNote?.title || "Edit note"}
                      </div>
                    </div>
                    {editorState.mode === "edit" && selectedNote && (
                      <Badge variant="secondary" className="text-[10px]">
                        Updated {selectedTimestamp}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="job-note-title"
                      className="text-[10px] uppercase tracking-wide text-muted-foreground"
                    >
                      Title
                    </label>
                    <Input
                      id="job-note-title"
                      autoFocus
                      value={draftTitle}
                      onChange={(event) => {
                        setDraftTitle(event.target.value);
                        setEditorError(null);
                      }}
                      placeholder="Why I am applying"
                      disabled={isSaving || isDeleting}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Content
                      </div>
                      <div className="text-xs text-muted-foreground">
                        TipTap editor
                      </div>
                    </div>
                    <RichTextEditor
                      key={
                        editorState.mode === "edit"
                          ? editorState.noteId
                          : "create-note"
                      }
                      value={draftContent}
                      onChange={(next) => {
                        setDraftContent(next);
                        setEditorError(null);
                      }}
                      placeholder="Capture answers, reminders, interview notes, and useful links."
                      className="bg-background/20"
                    />
                  </div>

                  {editorError && (
                    <div className="text-sm text-destructive">
                      {editorError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={isSaving || isDeleting}>
                      {isSaving ? "Saving..." : "Save note"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetEditor}
                      disabled={isSaving || isDeleting}
                    >
                      Cancel
                    </Button>
                    {editorState.mode === "edit" && selectedNote && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => confirmDeleteNote(selectedNote)}
                        disabled={isSaving || isDeleting}
                      >
                        Delete note
                      </Button>
                    )}
                  </div>
                </form>
              ) : selectedNote ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold">
                        {selectedNote.title}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Updated {selectedTimestamp}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => openEditEditor(selectedNote)}
                        disabled={!canEditOtherNotes}
                        aria-label="Edit note"
                        title="Edit note"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => confirmDeleteNote(selectedNote)}
                        disabled={!canEditOtherNotes}
                        aria-label="Delete note"
                        title="Delete note"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-card/70 p-4">
                    <JobDescriptionMarkdown
                      description={getRenderableJobDescription(
                        selectedNote.content,
                      )}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-start justify-between gap-4 rounded-xl border border-dashed border-border/60 bg-background/60 p-5">
                  <div className="space-y-2">
                    <div className="text-lg font-semibold">
                      No note selected
                    </div>
                    <div className="max-w-xl text-sm text-muted-foreground">
                      Notes you add here can hold interview answers, contact
                      details, and application-specific reminders. Select a note
                      on the left or create a new one to get started.
                    </div>
                  </div>
                  {!editorState && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openCreateEditor}
                    >
                      <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                      Add note
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDelete
        isOpen={noteToDelete !== null}
        onClose={() => setNoteToDelete(null)}
        onConfirm={() => void handleDeleteNote()}
        title="Delete note?"
        description="This will permanently delete this note from the job."
      />
    </section>
  );
};

export const JobPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const tasks = tasksQuery.data ?? [];
  const isLoading =
    jobQuery.isLoading || eventsQuery.isLoading || tasksQuery.isLoading;

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
      const message =
        error instanceof Error ? error.message : "Failed to log event";
      toast.error(message);
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
      const message =
        error instanceof Error ? error.message : "Failed to delete event";
      toast.error(message);
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
        const message =
          error instanceof Error ? error.message : "Failed to run action";
        toast.error(message);
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
      const message =
        error instanceof Error ? error.message : "Failed to upload resume PDF";
      toast.error(message);
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
  const pdfHref = job?.pdfPath
    ? `/pdfs/resume_${job.id}.pdf?v=${encodeURIComponent(job.updatedAt)}`
    : null;
  const isBusy = activeAction !== null;
  const isDiscovered = job?.status === "discovered";
  const isReady = job?.status === "ready";
  const isApplied = job?.status === "applied";
  const isInProgress = job?.status === "in_progress";

  if (!id) {
    return null;
  }

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-6 pb-12">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {job ? (
        <JobHeader
          job={job}
          className="rounded-lg border border-border/40 bg-muted/5 p-4"
          onCheckSponsor={handleCheckSponsor}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-sm text-muted-foreground">
          {isLoading ? "Loading application..." : "Application not found."}
        </div>
      )}

      {job && (
        <div className="rounded-xl border border-border/60 bg-card/80 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/65">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {jobLink && (
                <Button
                  asChild
                  size="sm"
                  className="h-9 border border-orange-400/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                >
                  <a href={jobLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Open Job Listing
                  </a>
                </Button>
              )}

              {isReady && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-orange-400/50 bg-orange-500/10 text-orange-100 hover:bg-orange-500/20"
                    onClick={() => void handleMarkApplied()}
                    disabled={isBusy}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Mark Applied
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-border/60 bg-background/30"
                    onClick={() => void handleSkip()}
                    disabled={isBusy}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Skip Job
                  </Button>
                </>
              )}

              {isDiscovered && (
                <>
                  <Button
                    size="sm"
                    className="h-9 border border-orange-400/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                    onClick={() => navigate(`/jobs/discovered/${job.id}`)}
                    disabled={isBusy}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Start Tailoring
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 border-border/60 bg-background/30"
                    onClick={() => void handleSkip()}
                    disabled={isBusy}
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Skip Job
                  </Button>
                </>
              )}

              {isApplied && (
                <Button
                  size="sm"
                  className="h-9 border border-orange-400/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                  onClick={() => void handleMoveToInProgress()}
                  disabled={isBusy}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Move to In Progress
                </Button>
              )}

              {isInProgress && (
                <Button
                  size="sm"
                  className="h-9 border border-orange-400/50 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30"
                  onClick={() => setIsLogModalOpen(true)}
                  disabled={!canLogEvents || isBusy}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Log Event
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isReady && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-border/60 bg-background/30"
                  onClick={() => navigate(`/jobs/ready/${job.id}`)}
                  disabled={isBusy}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Edit Tailoring
                </Button>
              )}

              {pdfHref && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-9 border-border/60 bg-background/30"
                >
                  <a href={pdfHref} target="_blank" rel="noopener noreferrer">
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    View PDF
                  </a>
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                className="h-9 border-border/60 bg-background/30"
                onClick={() => uploadPdfInputRef.current?.click()}
                disabled={isUploadingPdf}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {isUploadingPdf
                  ? "Uploading PDF"
                  : job?.pdfPath
                    ? "Replace PDF"
                    : "Upload PDF"}
              </Button>

              {isReady && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-border/60 bg-background/30"
                  onClick={() => void handleRegeneratePdf()}
                  disabled={isBusy}
                >
                  <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                  Regenerate PDF
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 border-border/60 bg-background/30"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={openEditDetails}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void handleCopyJobInfo()}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy job info
                  </DropdownMenuItem>
                  {(isReady || isDiscovered) && (
                    <DropdownMenuItem onSelect={() => void handleRescore()}>
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Recalculate match
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void handleCheckSponsor()}>
                    Check sponsorship status
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" />
                Stage timeline
              </CardTitle>
              <div className="flex items-center gap-2">
                {job?.salary && (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    <DollarSign className="mr-1 h-3.5 w-3.5" />
                    {job.salary}
                  </Badge>
                )}
                {currentStage && (
                  <Badge
                    variant="secondary"
                    className="px-3 py-1 text-xs font-medium uppercase tracking-wider"
                  >
                    {STAGE_LABELS[currentStage as ApplicationStage] ||
                      currentStage}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4" />
                  Application details
                </CardTitle>
                <GhostwriterDrawer job={job} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Current Stage
                </div>
                <div className="mt-1 text-sm font-medium">
                  {currentStage
                    ? STAGE_LABELS[currentStage as ApplicationStage] ||
                      currentStage
                    : job?.status}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Outcome
                </div>
                <div className="mt-1 text-sm font-medium">
                  {job?.outcome ? job.outcome.replace(/_/g, " ") : "Open"}
                </div>
              </div>
              {job?.closedAt && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Closed On
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {formatTimestamp(job.closedAt)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {tasks.length > 0 && (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4" />
                  Upcoming tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground/90">
                          {task.title}
                        </div>
                        {task.notes && (
                          <div className="text-xs text-muted-foreground">
                            {task.notes}
                          </div>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wide"
                      >
                        {formatTimestamp(task.dueDate)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {job?.id && <JobNotesCard jobId={job.id} />}

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

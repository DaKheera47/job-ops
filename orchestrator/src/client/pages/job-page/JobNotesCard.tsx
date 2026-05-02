import type { JobNote } from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { Edit2, FileText, PlusCircle, Trash2 } from "lucide-react";
import React from "react";
import { toast } from "sonner";
import * as api from "@/client/api";
import { ConfirmDelete } from "@/client/components/ConfirmDelete";
import { RichTextEditor } from "@/client/components/design-resume/RichTextEditor";
import { JobDescriptionMarkdown } from "@/client/components/JobDescriptionMarkdown";
import {
  useCreateJobNoteMutation,
  useDeleteJobNoteMutation,
  useUpdateJobNoteMutation,
} from "@/client/hooks/queries/useJobMutations";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { showErrorToast } from "@/client/lib/error-toast";
import { getRenderableJobDescription } from "@/client/lib/jobDescription";
import {
  markdownToEditorHtml as markdownToTipTapHtml,
  editorHtmlToMarkdown as tipTapHtmlToMarkdown,
} from "@/client/lib/jobNoteContent";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatDateTime } from "@/lib/utils";

const sortNotesByUpdatedAtDesc = (notes: JobNote[]) =>
  [...notes].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

type JobNotesCardProps = {
  jobId: string;
};

export const JobNotesCard: React.FC<JobNotesCardProps> = ({ jobId }) => {
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
      showErrorToast(error, "Failed to save note");
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
      showErrorToast(error, "Failed to delete note");
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
                      <Button
                        key={note.id}
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-auto w-full justify-start whitespace-normal rounded-xl border px-4 py-3 text-left font-normal transition",
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
                      </Button>
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

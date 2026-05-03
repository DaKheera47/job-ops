import {
  GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS,
  GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED,
  GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS,
} from "@shared/ghostwriter-note-context.js";
import type { JobNote } from "@shared/types";
import { ChevronDown, FileText, Info } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDateTime } from "@/lib/utils";

type NoteContextSelectorProps = {
  notes: JobNote[];
  selectedNoteIds: string[];
  disabled?: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  onChange: (selectedNoteIds: string[]) => void;
};

function getSelectedNotes(notes: JobNote[], selectedNoteIds: string[]) {
  const notesById = new Map(notes.map((note) => [note.id, note]));
  return selectedNoteIds
    .map((noteId) => notesById.get(noteId))
    .filter((note): note is JobNote => Boolean(note));
}

export const NoteContextSelector: React.FC<NoteContextSelectorProps> = ({
  notes,
  selectedNoteIds,
  disabled,
  isLoading,
  isSaving,
  onChange,
}) => {
  const selectedNotes = getSelectedNotes(notes, selectedNoteIds);
  const selectedContentChars = selectedNotes.reduce(
    (total, note) =>
      total +
      Math.min(
        note.content.trim().length,
        GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS,
      ),
    0,
  );
  const hasTotalOverflow =
    selectedContentChars > GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS;
  const isAtSelectionLimit =
    selectedNoteIds.length >= GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED;

  const toggleNote = (noteId: string) => {
    if (disabled || isLoading || isSaving) return;
    if (selectedNoteIds.includes(noteId)) {
      onChange(selectedNoteIds.filter((id) => id !== noteId));
      return;
    }
    if (isAtSelectionLimit) return;
    onChange([...selectedNoteIds, noteId]);
  };

  const triggerLabel =
    selectedNoteIds.length > 0 ? `${selectedNoteIds.length} notes` : "Notes";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 gap-1.5 px-2.5 text-xs",
            selectedNoteIds.length > 0 && "border-primary/40 bg-primary/5",
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>{isSaving ? "Saving..." : triggerLabel}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Ghostwriter notes</div>
            {selectedNoteIds.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {selectedNoteIds.length}/{GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED}
              </Badge>
            )}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {isLoading ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              Loading notes...
            </div>
          ) : notes.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              No job notes yet.
            </div>
          ) : (
            notes.map((note) => {
              const isSelected = selectedNoteIds.includes(note.id);
              const isTrimmed =
                note.content.trim().length >
                GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS;
              const isUnavailable = !isSelected && isAtSelectionLimit;
              const updatedAt =
                formatDateTime(note.updatedAt) ?? note.updatedAt;

              const checkboxId = `ghostwriter-note-context-${note.id}`;

              return (
                <div
                  key={note.id}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50",
                    isSelected && "bg-primary/5",
                    isUnavailable && "cursor-not-allowed opacity-55",
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isSelected}
                    disabled={
                      disabled || isLoading || isSaving || isUnavailable
                    }
                    className="mt-0.5"
                    onCheckedChange={() => toggleNote(note.id)}
                  />
                  <label
                    htmlFor={checkboxId}
                    className={cn(
                      "min-w-0 flex-1 cursor-pointer",
                      (disabled || isLoading || isSaving || isUnavailable) &&
                        "cursor-not-allowed",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {note.title}
                      </span>
                      {isSelected && isTrimmed && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px]"
                        >
                          Trimmed for AI
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Updated {updatedAt}
                    </span>
                  </label>
                </div>
              );
            })
          )}
        </div>

        {(isAtSelectionLimit || hasTotalOverflow) && (
          <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {isAtSelectionLimit && (
              <div className="flex items-center gap-1.5">
                <Info className="h-3 w-3" />
                <span>{GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED} note limit</span>
              </div>
            )}
            {hasTotalOverflow && (
              <div className="mt-1 flex items-start gap-1.5">
                <Info className="mt-0.5 h-3 w-3" />
                <span>
                  Selected notes exceed the AI context budget; later notes will
                  be trimmed.
                </span>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

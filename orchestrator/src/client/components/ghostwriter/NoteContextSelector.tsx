import {
  GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS,
  GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED,
  GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS,
} from "@shared/ghostwriter-note-context.js";
import type { JobNote } from "@shared/types";
import { FileText } from "lucide-react";
import type React from "react";
import { formatDateTime } from "@/lib/utils";
import { ContextSelectorPopover } from "./ContextSelectorPopover";

type NoteContextSelectorProps = {
  notes: JobNote[];
  selectedNoteIds: string[];
  disabled?: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  onChange: (selectedNoteIds: string[]) => void;
};

export const NoteContextSelector: React.FC<NoteContextSelectorProps> = ({
  notes,
  selectedNoteIds,
  disabled,
  isLoading,
  isSaving,
  onChange,
}) => (
  <ContextSelectorPopover
    items={notes}
    selectedIds={selectedNoteIds}
    icon={FileText}
    defaultTriggerLabel="Notes"
    selectedTriggerLabel={(count) => `${count} notes`}
    headerLabel="Ghostwriter notes"
    loadingLabel="Loading notes..."
    emptyLabel="No job notes yet."
    limitLabel={`${GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED} note limit`}
    overflowLabel="Selected notes exceed the AI context budget; later notes will be trimmed."
    maxSelected={GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED}
    maxItemChars={GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS}
    maxTotalChars={GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS}
    disabled={disabled}
    isLoading={isLoading}
    isSaving={isSaving}
    getId={(note) => note.id}
    getTitle={(note) => note.title}
    getMeta={(note) =>
      `Updated ${formatDateTime(note.updatedAt) ?? note.updatedAt}`
    }
    getContentLength={(note) => note.content.trim().length}
    getCheckboxId={(note) => `ghostwriter-note-context-${note.id}`}
    onChange={onChange}
  />
);

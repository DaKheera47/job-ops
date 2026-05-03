import type { JobNote } from "./types/jobs";

export const GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED = 8;
export const GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS = 3000;
export const GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS = 12000;

export type GhostwriterNoteContextItem = {
  id: string;
  title: string;
  updatedAt: string;
  content: string;
  wasTrimmed: boolean;
};

export type GhostwriterNoteContextBuildResult = {
  items: GhostwriterNoteContextItem[];
  totalContentChars: number;
  wasTotalTrimmed: boolean;
};

export function normalizeGhostwriterSelectedNoteIds(
  selectedNoteIds: readonly string[],
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const noteId of selectedNoteIds) {
    const trimmed = noteId.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function buildGhostwriterNoteContextItems(
  notes: readonly JobNote[],
): GhostwriterNoteContextBuildResult {
  let remainingTotal = GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS;
  let totalContentChars = 0;
  let wasTotalTrimmed = false;

  const items = notes.map((note) => {
    const content = note.content.trim();
    const perNoteContent = content.slice(
      0,
      GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS,
    );
    const finalContent = perNoteContent.slice(0, Math.max(remainingTotal, 0));
    const wasTrimmed =
      content.length > finalContent.length ||
      perNoteContent.length > finalContent.length;

    totalContentChars += content.length;
    remainingTotal -= finalContent.length;
    if (perNoteContent.length > finalContent.length) {
      wasTotalTrimmed = true;
    }

    return {
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
      content: finalContent,
      wasTrimmed,
    };
  });

  return {
    items,
    totalContentChars,
    wasTotalTrimmed,
  };
}

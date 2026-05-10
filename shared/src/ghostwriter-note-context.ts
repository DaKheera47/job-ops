import {
  buildGhostwriterContextBudgetItems,
  normalizeGhostwriterSelectedContextIds,
} from "./ghostwriter-context-utils";
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
  return normalizeGhostwriterSelectedContextIds(selectedNoteIds);
}

export function buildGhostwriterNoteContextItems(
  notes: readonly JobNote[],
): GhostwriterNoteContextBuildResult {
  const result = buildGhostwriterContextBudgetItems(notes, {
    maxItemChars: GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS,
    maxTotalChars: GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS,
    getContent: (note) => note.content,
    mapItem: ({ item: note, content, wasTrimmed }) => ({
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
      content,
      wasTrimmed,
    }),
  });

  return {
    items: result.items,
    totalContentChars: result.totalContentChars,
    wasTotalTrimmed: result.wasTotalTrimmed,
  };
}

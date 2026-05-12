import {
  buildGhostwriterContextBudgetItems,
  normalizeGhostwriterSelectedContextIds,
} from "./ghostwriter-context-utils";
import type { JobDocument } from "./types";

export const GHOSTWRITER_DOCUMENT_CONTEXT_MAX_SELECTED = 5;
export const GHOSTWRITER_DOCUMENT_CONTEXT_MAX_DOCUMENT_CHARS = 6000;
export const GHOSTWRITER_DOCUMENT_CONTEXT_MAX_TOTAL_CHARS = 12000;

export type GhostwriterDocumentContextSource = JobDocument & {
  content: string;
};

export type GhostwriterDocumentContextItem = {
  id: string;
  fileName: string;
  mediaType: string | null;
  byteSize: number;
  createdAt: string;
  content: string;
  wasTrimmed: boolean;
};

export type GhostwriterDocumentContextBuildResult = {
  items: GhostwriterDocumentContextItem[];
  totalContentChars: number;
  wasTotalTrimmed: boolean;
};

export function normalizeGhostwriterSelectedDocumentIds(
  selectedDocumentIds: readonly string[],
): string[] {
  return normalizeGhostwriterSelectedContextIds(selectedDocumentIds);
}

export function buildGhostwriterDocumentContextItems(
  documents: readonly GhostwriterDocumentContextSource[],
): GhostwriterDocumentContextBuildResult {
  const result = buildGhostwriterContextBudgetItems(documents, {
    maxItemChars: GHOSTWRITER_DOCUMENT_CONTEXT_MAX_DOCUMENT_CHARS,
    maxTotalChars: GHOSTWRITER_DOCUMENT_CONTEXT_MAX_TOTAL_CHARS,
    getContent: (document) => document.content,
    mapItem: ({ item, content, wasTrimmed }) => ({
      id: item.id,
      fileName: item.fileName,
      mediaType: item.mediaType,
      byteSize: item.byteSize,
      createdAt: item.createdAt,
      content,
      wasTrimmed,
    }),
  });

  return result;
}

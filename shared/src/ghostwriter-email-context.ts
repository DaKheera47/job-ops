import {
  buildGhostwriterContextBudgetItems,
  normalizeGhostwriterSelectedContextIds,
} from "./ghostwriter-context-utils";
import type { PostApplicationJobEmailItem } from "./types/post-application";

export const GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED = 8;
export const GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS = 1200;
export const GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS = 8000;

export type GhostwriterEmailContextItem = {
  id: string;
  sender: string;
  subject: string;
  receivedAt: number | null;
  messageType: string;
  processingStatus: string;
  matchConfidence: number | null;
  accountDisplayName: string | null;
  sourceUrl: string | null;
  snippet: string;
  wasTrimmed: boolean;
};

export type GhostwriterEmailContextBuildResult = {
  items: GhostwriterEmailContextItem[];
  totalSnippetChars: number;
  wasTotalTrimmed: boolean;
};

export function normalizeGhostwriterSelectedEmailIds(
  selectedEmailIds: readonly string[],
): string[] {
  return normalizeGhostwriterSelectedContextIds(selectedEmailIds);
}

export function buildGhostwriterEmailContextItems(
  emails: readonly PostApplicationJobEmailItem[],
): GhostwriterEmailContextBuildResult {
  const result = buildGhostwriterContextBudgetItems(emails, {
    maxItemChars: GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS,
    maxTotalChars: GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS,
    getContent: (email) => email.message.snippet,
    mapItem: ({ item: email, content: snippet, wasTrimmed }) => {
      const senderName = email.message.senderName?.trim();
      const fromAddress = email.message.fromAddress.trim();

      return {
        id: email.message.id,
        sender: senderName || fromAddress || "Unknown sender",
        subject: email.message.subject.trim() || "No subject",
        receivedAt: email.message.receivedAt,
        messageType: email.message.messageType,
        processingStatus: email.message.processingStatus,
        matchConfidence: email.message.matchConfidence,
        accountDisplayName: email.accountDisplayName,
        sourceUrl: email.sourceUrl,
        snippet,
        wasTrimmed,
      };
    },
  });

  return {
    items: result.items,
    totalSnippetChars: result.totalContentChars,
    wasTotalTrimmed: result.wasTotalTrimmed,
  };
}

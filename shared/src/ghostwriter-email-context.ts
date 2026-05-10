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
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const emailId of selectedEmailIds) {
    const trimmed = emailId.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function buildGhostwriterEmailContextItems(
  emails: readonly PostApplicationJobEmailItem[],
): GhostwriterEmailContextBuildResult {
  let remainingTotal = GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS;
  let totalSnippetChars = 0;
  let wasTotalTrimmed = false;

  const items = emails.map((email) => {
    const snippet = email.message.snippet.trim();
    const perEmailSnippet = snippet.slice(
      0,
      GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS,
    );
    const finalSnippet = perEmailSnippet.slice(0, Math.max(remainingTotal, 0));
    const wasTrimmed =
      snippet.length > finalSnippet.length ||
      perEmailSnippet.length > finalSnippet.length;

    totalSnippetChars += snippet.length;
    remainingTotal -= finalSnippet.length;
    if (perEmailSnippet.length > finalSnippet.length) {
      wasTotalTrimmed = true;
    }

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
      snippet: finalSnippet,
      wasTrimmed,
    };
  });

  return {
    items,
    totalSnippetChars,
    wasTotalTrimmed,
  };
}

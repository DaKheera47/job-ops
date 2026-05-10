/**
 * Shared TTL-aware "awaiting text input" state for Telegram bot handlers.
 * One handler asks the user a question, captures the next text reply within
 * 5 minutes. After that the entry self-purges so an unrelated message
 * doesn't get captured by an orphan prompt.
 */

const AWAITING_INPUT_TTL_MS = 5 * 60 * 1000;

interface AwaitingEntry {
  action: string;
  expiresAt: number;
}

const map = new Map<number, AwaitingEntry>();

export const awaitingInput = {
  set(chatId: number, action: string): void {
    map.set(chatId, {
      action,
      expiresAt: Date.now() + AWAITING_INPUT_TTL_MS,
    });
  },
  get(chatId: number): string | undefined {
    const entry = map.get(chatId);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      map.delete(chatId);
      return undefined;
    }
    return entry.action;
  },
  delete(chatId: number): void {
    map.delete(chatId);
  },
};

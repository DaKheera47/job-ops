/**
 * Telegram subscriber for the Gmail post-application sync.
 *
 * Listens to two event streams:
 *   1. Per-message events from `gmail-sync-events` — one Telegram message per
 *      processed email (auto-link / pending-review / no-match).  The DB row
 *      is stamped with `telegram_notified_at` after a successful send, so the
 *      scheduler never re-notifies the user about the same email.
 *   2. Health events from `gmail-sync-scheduler` — surfaced for tick-completed
 *      summaries (only when there were actionable messages) and for the
 *      "3 consecutive failures → reconnect Gmail" alert.
 *
 * Reliability features:
 *   - Per-chat 50ms inter-message delay (Telegram global limit ~30 msg/sec).
 *   - Only emits when `areNotificationsEnabled()` is true AND the user has
 *     `gmailNotificationsEnabled` on.
 *   - On send error we DO NOT mark the message as notified, so the next tick
 *     will try again.
 */

import { logger } from "@infra/logger";
import * as settingsRepo from "@server/repositories/settings";
import {
  type GmailProcessedMessageEvent,
  subscribeToGmailProcessedMessages,
} from "@server/services/post-application/ingestion/gmail-sync-events";
import {
  subscribeToGmailSyncHealth,
  type GmailSyncHealthEvent,
} from "@server/services/gmail-sync-scheduler";
import { markPostApplicationMessageNotified } from "@server/repositories/post-application-messages";
import { InlineKeyboard } from "grammy";
import { areNotificationsEnabled, getAuthorizedChatIds } from "./auth";
import { getBot } from "./bot";
import { escapeHtml } from "./formatting";

let processedUnsub: (() => void) | null = null;
let healthUnsub: (() => void) | null = null;

const SEND_INTERVAL_MS = 50;

async function isGmailNotificationsEnabled(): Promise<boolean> {
  const raw = await settingsRepo.getSetting("gmailNotificationsEnabled");
  if (raw === null || raw === undefined) return true; // default-on
  return raw === "true" || raw === "1";
}

async function broadcast(
  text: string,
  options?: { reply_markup?: InlineKeyboard },
): Promise<boolean> {
  const bot = getBot();
  if (!bot) return false;
  if (!(await areNotificationsEnabled())) return false;
  if (!(await isGmailNotificationsEnabled())) return false;

  const chatIds = await getAuthorizedChatIds();
  if (chatIds.size === 0) return false;

  let anyDelivered = false;
  let first = true;
  for (const chatId of chatIds) {
    if (!first) await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
    first = false;
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: options?.reply_markup,
        link_preview_options: { is_disabled: true },
      });
      anyDelivered = true;
    } catch (err) {
      logger.warn("Failed to send Gmail Telegram notification", {
        chatId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return anyDelivered;
}

function shortenSubject(subject: string, max = 120): string {
  const trimmed = subject.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function shortenReason(reason: string, max = 240): string {
  const trimmed = reason.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function formatStageLabel(stage: string): string {
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildMessageBody(event: GmailProcessedMessageEvent): string {
  const sender = event.senderName
    ? `${event.senderName} <${event.fromAddress}>`
    : event.fromAddress;

  const lines: string[] = [];
  lines.push("<b>📬 New post-application email</b>");
  lines.push("");
  lines.push(`From: <i>${escapeHtml(sender)}</i>`);
  lines.push(`Subject: <b>${escapeHtml(shortenSubject(event.subject))}</b>`);
  lines.push("");

  if (event.action === "auto_linked" && event.matchedJobId) {
    lines.push("🤖 <b>Auto-classified</b>");
    lines.push(
      `🎯 Matched: <b>${escapeHtml(event.matchedJobTitle ?? "")}</b> @ ${escapeHtml(event.matchedJobEmployer ?? "")}`,
    );
    lines.push(`🔒 Confidence: ${event.confidence}%`);
    if (event.stageTransitionApplied && event.toStage !== "no_change") {
      lines.push(
        `📍 Stage event recorded: <b>${escapeHtml(formatStageLabel(event.toStage))}</b>`,
      );
    } else {
      lines.push("📍 No stage change (informational email)");
    }
  } else if (event.action === "pending_review" && event.matchedJobId) {
    lines.push("⚠️ <b>Awaiting your review</b>");
    lines.push(
      `🎯 Possible match: <b>${escapeHtml(event.matchedJobTitle ?? "")}</b> @ ${escapeHtml(event.matchedJobEmployer ?? "")}`,
    );
    lines.push(`🤔 Confidence: ${event.confidence}% (below auto-link threshold)`);
    lines.push(
      `💡 Suggested stage: <i>${escapeHtml(formatStageLabel(event.toStage))}</i>`,
    );
  } else if (event.action === "no_match") {
    lines.push("📨 <b>Relevant email, no matching job</b>");
    lines.push(
      `Was this for a job that's not tracked here? Open the email and add it manually.`,
    );
  } else if (event.action === "error") {
    lines.push("⚠️ <b>Could not process this email</b>");
    if (event.errorMessage) {
      lines.push(`<code>${escapeHtml(event.errorMessage)}</code>`);
    }
  }

  if (event.reason) {
    lines.push("");
    lines.push(`<i>${escapeHtml(shortenReason(event.reason))}</i>`);
  }

  return lines.join("\n");
}

function buildKeyboard(
  event: GmailProcessedMessageEvent,
): InlineKeyboard | undefined {
  if (event.matchedJobId) {
    const shortId = event.matchedJobId.slice(0, 8);
    return new InlineKeyboard()
      .text("📂 Open job", `j:d:${shortId}`)
      .text("📋 Inbox", "g:inbox");
  }
  return new InlineKeyboard().text("📋 Tracking Inbox", "g:inbox");
}

async function handleProcessedMessage(
  event: GmailProcessedMessageEvent,
): Promise<void> {
  // The emitter has already filtered out "ignored" messages, but be defensive
  // in case of future callers.
  if (event.action === "ignored") return;

  const text = buildMessageBody(event);
  const delivered = await broadcast(text, {
    reply_markup: buildKeyboard(event),
  });

  // Only stamp telegram_notified_at after a successful send to any chat.
  // Failure → next tick will retry the same email (idempotent + safe).
  if (delivered) {
    try {
      await markPostApplicationMessageNotified(event.messageId);
    } catch (err) {
      logger.warn("Failed to mark Gmail message as notified", {
        messageId: event.messageId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    logger.debug("Gmail notification skipped (no chats or disabled)", {
      messageId: event.messageId,
    });
  }
}

async function handleHealthEvent(event: GmailSyncHealthEvent): Promise<void> {
  if (event.type === "account_failed" && event.shouldAlertUser) {
    await broadcast(
      `⚠️ <b>Gmail sync failing</b>\n\n` +
        `Account: <code>${escapeHtml(event.accountKey)}</code>\n` +
        `Last error:\n<code>${escapeHtml(event.error.slice(0, 300))}</code>\n\n` +
        `Reconnect Gmail in Settings → Tracking Inbox.`,
    );
    return;
  }

  if (event.type === "tick_completed") {
    // Suppress the summary when nothing happened — quiet by default.
    const meaningful =
      event.totals.classified > 0 || event.totals.errored > 0;
    if (!meaningful) return;

    await broadcast(
      `🔁 <b>Gmail sync done</b>\n\n` +
        `Accounts: ${event.accountCount}\n` +
        `Discovered: ${event.totals.discovered}\n` +
        `Relevant: ${event.totals.relevant}\n` +
        `Classified: ${event.totals.classified}\n` +
        (event.totals.errored > 0
          ? `Errored: ${event.totals.errored}`
          : "All ok ✅"),
    );
  }
}

export function startGmailNotificationSubscriptions(): void {
  if (!processedUnsub) {
    processedUnsub = subscribeToGmailProcessedMessages((event) => {
      void handleProcessedMessage(event);
    });
  }
  if (!healthUnsub) {
    healthUnsub = subscribeToGmailSyncHealth((event) => {
      void handleHealthEvent(event);
    });
  }
}

export function stopGmailNotificationSubscriptions(): void {
  if (processedUnsub) {
    processedUnsub();
    processedUnsub = null;
  }
  if (healthUnsub) {
    healthUnsub();
    healthUnsub = null;
  }
}

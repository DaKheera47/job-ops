/**
 * Telegram handlers for the Gmail post-application sync.
 *
 * Callbacks:
 *   g:sync     — run the sync now for every connected account
 *   g:status   — show scheduler status + last-sync timestamps
 *   g:inbox    — show pending-review messages summary (placeholder)
 *
 * Commands:
 *   /sync         — alias for g:sync
 *   /gmail-status — alias for g:status
 */

import { logger } from "@infra/logger";
import {
  getGmailSyncSchedulerStatus,
  runGmailSyncForAllAccounts,
} from "@server/services/gmail-sync-scheduler";
import { listConnectedPostApplicationIntegrations } from "@server/repositories/post-application-integrations";
import { listPostApplicationMessagesByProcessingStatus } from "@server/repositories/post-application-messages";
import * as settingsRepo from "@server/repositories/settings";
import { InlineKeyboard, type Bot, type Context } from "grammy";
import { escapeHtml } from "../formatting";

function formatTimestamp(epochMs: number | null): string {
  if (!epochMs) return "never";
  const diffMs = Date.now() - epochMs;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

async function buildStatusText(): Promise<string> {
  const scheduler = getGmailSyncSchedulerStatus();
  const accounts =
    await listConnectedPostApplicationIntegrations("gmail").catch(() => []);
  const pending = await listPostApplicationMessagesByProcessingStatus(
    "gmail",
    "default",
    "pending_user",
  ).catch(() => []);

  const enabledRaw = await settingsRepo
    .getSetting("gmailSyncEnabled")
    .catch(() => null);
  const intervalRaw = await settingsRepo
    .getSetting("gmailSyncIntervalHours")
    .catch(() => null);
  const autoThresholdRaw = await settingsRepo
    .getSetting("gmailAutoLinkConfidence")
    .catch(() => null);

  const enabled = enabledRaw === "true" || enabledRaw === "1" || enabledRaw === null;
  const intervalHours = intervalRaw ? Number.parseInt(intervalRaw, 10) : 2;
  const autoThreshold = autoThresholdRaw
    ? Number.parseInt(autoThresholdRaw, 10)
    : 95;

  const lines: string[] = [];
  lines.push("<b>📬 Gmail Sync Status</b>");
  lines.push("");
  lines.push(
    `Scheduler: ${enabled ? "✅ enabled" : "⏸ disabled"} (every ${intervalHours}h)`,
  );
  lines.push(
    `Auto-link threshold: <b>${autoThreshold}%</b> confidence`,
  );
  lines.push("");
  if (accounts.length === 0) {
    lines.push("🔌 <b>No Gmail account connected.</b>");
    lines.push(
      `<i>Open Settings → Tracking Inbox in the web app to connect olga.fadeeva.job@gmail.com.</i>`,
    );
  } else {
    lines.push("<b>Accounts</b>");
    for (const a of accounts) {
      const email = (a.credentials?.email as string | undefined) ?? a.accountKey;
      lines.push(
        `• <code>${escapeHtml(email)}</code> — last sync ${formatTimestamp(a.lastSyncedAt)}`,
      );
      if (a.lastError) {
        lines.push(
          `   ⚠️ ${escapeHtml(a.lastError.slice(0, 200))}`,
        );
      }
    }
  }
  lines.push("");
  if (scheduler.inFlight) {
    lines.push("⏳ A sync is currently running.");
  } else {
    lines.push(`Last tick: ${formatTimestamp(scheduler.lastTickCompletedAt)}`);
  }
  lines.push(`📋 Pending review: <b>${pending.length}</b> message(s)`);

  if (Object.keys(scheduler.consecutiveFailures).length > 0) {
    lines.push("");
    lines.push("⚠️ <b>Recent failures</b>");
    for (const [account, count] of Object.entries(scheduler.consecutiveFailures)) {
      lines.push(`• <code>${escapeHtml(account)}</code>: ${count} in a row`);
    }
  }

  return lines.join("\n");
}

function buildStatusKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Sync now", "g:sync")
    .text("📋 Pending", "g:inbox")
    .row()
    .text("◀️ Menu", "m:menu");
}

async function showStatus(ctx: Context): Promise<void> {
  const text = await buildStatusText();
  const keyboard = buildStatusKeyboard();
  if (ctx.callbackQuery) {
    await ctx
      .editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard })
      .catch(() => {});
  } else {
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  }
}

async function runManualSync(ctx: Context): Promise<void> {
  const status = getGmailSyncSchedulerStatus();
  if (status.inFlight) {
    await ctx.reply(
      "⏳ Sync is already running. Wait for it to finish before triggering another.",
    );
    return;
  }

  const accounts = await listConnectedPostApplicationIntegrations(
    "gmail",
  ).catch(() => []);
  if (accounts.length === 0) {
    await ctx.reply(
      "🔌 No Gmail account is connected. Open Settings → Tracking Inbox in the web app to connect one.",
    );
    return;
  }

  const reply = await ctx.reply(
    "🔁 Syncing Gmail... this can take 30–60 seconds.",
  );
  const replyMessageId = typeof reply === "object" ? reply.message_id : null;

  try {
    const result = await runGmailSyncForAllAccounts({ reason: "manual" });
    const summaryLines = [
      "✅ <b>Gmail sync done</b>",
      "",
      `Accounts synced: ${result.ranAccounts}`,
      `Discovered: ${result.totals.discovered}`,
      `Relevant: ${result.totals.relevant}`,
      `Classified: ${result.totals.classified}`,
    ];
    if (result.totals.errored > 0) {
      summaryLines.push(`⚠️ Errored: ${result.totals.errored}`);
    }
    summaryLines.push("");
    summaryLines.push(
      "<i>Detailed per-email notifications will follow if anything new was found.</i>",
    );

    if (replyMessageId && ctx.chat) {
      await ctx.api
        .editMessageText(ctx.chat.id, replyMessageId, summaryLines.join("\n"), {
          parse_mode: "HTML",
        })
        .catch(() => {});
    } else {
      await ctx.reply(summaryLines.join("\n"), { parse_mode: "HTML" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Manual Gmail sync failed", { error: msg });
    if (replyMessageId && ctx.chat) {
      await ctx.api
        .editMessageText(
          ctx.chat.id,
          replyMessageId,
          `❌ <b>Gmail sync failed</b>\n\n<code>${escapeHtml(msg.slice(0, 300))}</code>`,
          { parse_mode: "HTML" },
        )
        .catch(() => {});
    }
  }
}

async function showInbox(ctx: Context): Promise<void> {
  const pending = await listPostApplicationMessagesByProcessingStatus(
    "gmail",
    "default",
    "pending_user",
  ).catch(() => []);

  const lines: string[] = [
    `<b>📋 Tracking Inbox — pending review (${pending.length})</b>`,
    "",
  ];
  if (pending.length === 0) {
    lines.push("Nothing waiting. ✅");
  } else {
    for (const m of pending.slice(0, 10)) {
      const sender = m.senderName ?? m.fromAddress;
      const subject = m.subject.length > 80 ? `${m.subject.slice(0, 79)}…` : m.subject;
      lines.push(`• <b>${escapeHtml(subject)}</b>`);
      lines.push(`  from ${escapeHtml(sender)} — ${m.matchConfidence ?? 0}% confidence`);
    }
    if (pending.length > 10) {
      lines.push("");
      lines.push(`<i>+${pending.length - 10} more — open Tracking Inbox in web app.</i>`);
    }
  }

  const keyboard = new InlineKeyboard()
    .text("🔄 Sync now", "g:sync")
    .text("◀️ Back", "g:status");

  if (ctx.callbackQuery) {
    await ctx
      .editMessageText(lines.join("\n"), {
        parse_mode: "HTML",
        reply_markup: keyboard,
      })
      .catch(() => {});
  } else {
    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }
}

export function registerGmailHandlers(bot: Bot): void {
  bot.command("sync", runManualSync);
  bot.command("gmail_status", showStatus);
  bot.command("gmail", showStatus);

  bot.callbackQuery("g:sync", async (ctx) => {
    await ctx.answerCallbackQuery("Starting sync...").catch(() => {});
    await runManualSync(ctx);
  });

  bot.callbackQuery("g:status", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await showStatus(ctx);
  });

  bot.callbackQuery("g:inbox", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await showInbox(ctx);
  });
}

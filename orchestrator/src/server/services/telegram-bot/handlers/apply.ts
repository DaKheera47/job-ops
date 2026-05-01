import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import * as jobsRepo from "../../../repositories/jobs";
import {
  getLinkedInSessionStatus,
} from "../../linkedin-auto-apply";
import {
  startBatchApply,
  cancelBatchApply,
  getBatchProgress,
  subscribeToBatchProgress,
  isBatchRunning,
} from "../../linkedin-auto-apply/batch";
import { formatBatchProgress } from "../formatting";

export function registerApplyHandlers(bot: Bot): void {
  // Apply status panel
  bot.callbackQuery("a:status", async (ctx) => {
    await ctx.answerCallbackQuery();

    const session = await getLinkedInSessionStatus();
    const readyJobs = await jobsRepo.getJobListItems(["ready"]);
    const linkedInReady = readyJobs.filter((j) => j.source === "linkedin");

    const sessionIcon = session.authenticated ? "✅" : "❌";
    const text =
      `<b>🚀 LinkedIn Auto Apply</b>\n\n` +
      `🔌 Session: ${sessionIcon} ${session.authenticated ? "Connected" : "Not connected"}\n` +
      `📋 Ready LinkedIn jobs: ${linkedInReady.length}`;

    const keyboard = new InlineKeyboard();

    if (linkedInReady.length > 0 && session.authenticated) {
      keyboard.text(`🚀 Apply All (${linkedInReady.length})`, "a:all");
    } else if (!session.authenticated) {
      keyboard.text("🔌 Login required (use web UI)", "noop");
    }

    if (isBatchRunning()) {
      keyboard.row().text("⏹ Cancel Batch", "a:cancel");
    }

    keyboard.row().text("◀️ Back", "m:menu");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Start batch apply
  bot.callbackQuery("a:all", async (ctx) => {
    await ctx.answerCallbackQuery("Starting batch apply...");
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const readyJobs = await jobsRepo.getJobListItems(["ready"]);
    const linkedInIds = readyJobs
      .filter((j) => j.source === "linkedin")
      .map((j) => j.id);

    if (linkedInIds.length === 0) {
      await ctx.editMessageText("No LinkedIn ready jobs found.", {
        reply_markup: new InlineKeyboard().text("◀️ Back", "m:menu"),
      });
      return;
    }

    const statusMsg = await ctx.editMessageText(
      `<b>🚀 Batch Apply Starting...</b>\n\nApplying to ${linkedInIds.length} jobs. Watch the browser viewer on your laptop.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("⏹ Cancel", "a:cancel"),
      },
    );
    const messageId = statusMsg.message_id;

    // Start batch in background
    startBatchApply(linkedInIds).catch(() => {});

    let lastUpdate = 0;
    const unsubscribe = subscribeToBatchProgress((progress) => {
      const now = Date.now();
      if (now - lastUpdate < 5000) return;
      lastUpdate = now;

      const text = formatBatchProgress(progress);
      const keyboard = new InlineKeyboard();

      if (progress.running) {
        keyboard.text("⏹ Cancel", "a:cancel");
      } else {
        const applied = progress.results.filter((r) => r.status === "applied").length;
        const failed = progress.results.filter((r) => r.status === "failed").length;
        const manual = progress.results.filter((r) => r.status === "manual_required").length;

        keyboard.text("📋 View Applied", "j:applied:0");
        if (manual > 0) keyboard.text(`⚠️ Manual (${manual})`, "j:ready:0");
        keyboard.row().text("◀️ Menu", "m:menu");
      }

      ctx.api
        .editMessageText(chatId, messageId, text, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        })
        .catch(() => {});

      if (!progress.running) unsubscribe();
    });
  });

  // Cancel batch
  bot.callbackQuery("a:cancel", async (ctx) => {
    cancelBatchApply();
    await ctx.answerCallbackQuery("Cancelling batch apply...");
  });
}

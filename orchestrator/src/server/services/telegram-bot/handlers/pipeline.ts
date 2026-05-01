import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { runWithRequestContext } from "@infra/request-context";
import {
  runPipeline,
  requestPipelineCancel,
  getPipelineStatus,
} from "../../../pipeline/orchestrator";
import { subscribeToProgress, getProgress } from "../../../pipeline/progress";
import { getPipelineSchedulerStatus } from "../../pipeline-scheduler";
import { formatPipelineProgress } from "../formatting";

export function registerPipelineHandlers(bot: Bot): void {
  // Show pipeline status
  bot.callbackQuery("p:status", async (ctx) => {
    await ctx.answerCallbackQuery();
    const status = getPipelineStatus();
    const scheduler = getPipelineSchedulerStatus();
    const progress = getProgress();

    let text = "<b>🔍 Pipeline</b>\n\n";

    if (status.isRunning) {
      text += formatPipelineProgress(progress);
    } else {
      text += "Status: Idle\n";
      if (scheduler.enabled && scheduler.nextRun) {
        text += `\n⏰ Next run: ${scheduler.nextRun}`;
      } else {
        text += "\n⏰ Schedule: Disabled";
      }
    }

    const keyboard = new InlineKeyboard();
    if (status.isRunning) {
      keyboard.text("⏹ Cancel", "p:cancel");
    } else {
      keyboard.text("▶️ Run Now", "p:run");
    }
    keyboard.row().text("◀️ Back", "m:menu");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Run pipeline
  bot.callbackQuery("p:run", async (ctx) => {
    await ctx.answerCallbackQuery("Starting pipeline...");
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const statusMsg = await ctx.editMessageText(
      "<b>🔄 Pipeline Starting...</b>\n\nPreparing crawlers...",
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("⏹ Cancel", "p:cancel") },
    );

    // Run pipeline in background with progress updates
    const messageId = statusMsg.message_id;

    runWithRequestContext({}, async () => {
      let lastUpdate = 0;

      const unsubscribe = subscribeToProgress((progress) => {
        const now = Date.now();
        if (now - lastUpdate < 3000) return; // Rate limit edits to every 3s
        lastUpdate = now;

        const text = formatPipelineProgress(progress);
        const isTerminal = ["completed", "failed", "cancelled"].includes(progress.step);

        const keyboard = new InlineKeyboard();
        if (isTerminal) {
          keyboard.text("📋 View Ready Jobs", "j:ready:0").row().text("◀️ Menu", "m:menu");
        } else {
          keyboard.text("⏹ Cancel", "p:cancel");
        }

        ctx.api
          .editMessageText(chatId, messageId, text, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          })
          .catch(() => {}); // ignore edit race conditions
      });

      try {
        await runPipeline();
      } finally {
        unsubscribe();
      }
    }).catch((err) => {
      ctx.api
        .editMessageText(
          chatId,
          messageId,
          `<b>❌ Pipeline Error</b>\n\n${err instanceof Error ? err.message : String(err)}`,
          {
            parse_mode: "HTML",
            reply_markup: new InlineKeyboard()
              .text("🔄 Retry", "p:run")
              .row()
              .text("◀️ Menu", "m:menu"),
          },
        )
        .catch(() => {});
    });
  });

  // Cancel pipeline
  bot.callbackQuery("p:cancel", async (ctx) => {
    requestPipelineCancel();
    await ctx.answerCallbackQuery("Cancelling pipeline...");
  });
}

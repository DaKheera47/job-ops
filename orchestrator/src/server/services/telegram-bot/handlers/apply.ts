import { logger } from "@infra/logger";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import * as jobsRepo from "../../../repositories/jobs";

export function registerApplyHandlers(bot: Bot): void {
  // Apply status panel — auto-apply not yet ready; this is the manual review
  // landing page that points the user at the ready-jobs list so they can apply
  // one at a time.
  bot.callbackQuery("a:status", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();

      const readyJobs = await jobsRepo.getJobListItems(["ready"]);
      const linkedInReady = readyJobs.filter((j) => j.source === "linkedin");
      const totalReady = readyJobs.length;

      const text =
        `<b>🚀 Apply</b>\n\n` +
        `📋 Ready jobs total: <b>${totalReady}</b>\n` +
        `🔗 LinkedIn ready: <b>${linkedInReady.length}</b>\n\n` +
        `<i>🔜 LinkedIn auto-apply is coming soon.</i>\n` +
        `For now, open <b>Manual Review</b> to apply one job at a time — generate a tailored CV, cover letter, and referral message per posting.`;

      const keyboard = new InlineKeyboard()
        .text("📋 Manual Review", "j:ready:0")
        .row()
        .text("📊 Stats", "s:stats")
        .text("⚙️ Settings", "x:menu")
        .row()
        .text("◀️ Menu", "m:menu");

      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (err) {
      logger.error("Apply status error", {
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.answerCallbackQuery("❌ Error loading status").catch(() => {});
    }
  });
}

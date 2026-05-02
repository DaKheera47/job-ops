import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import * as jobsRepo from "../../../repositories/jobs";

export function registerApplyHandlers(bot: Bot): void {
  // Apply status panel — TODO: auto-apply not yet ready
  bot.callbackQuery("a:status", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();

      const readyJobs = await jobsRepo.getJobListItems(["ready"]);
      const linkedInReady = readyJobs.filter((j) => j.source === "linkedin");

      const text =
        `<b>🚀 LinkedIn Auto Apply</b>\n\n` +
        `📋 Ready LinkedIn jobs: ${linkedInReady.length}\n\n` +
        `🔜 Auto-apply coming soon.\n` +
        `Use the job list to apply one by one.`;

      const keyboard = new InlineKeyboard()
        .text("📋 Ready Jobs", "j:ready:0")
        .row()
        .text("◀️ Back", "m:menu");

      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (err) {
      console.error("Apply status error:", err);
      await ctx.answerCallbackQuery("❌ Error loading status").catch(() => {});
    }
  });
}

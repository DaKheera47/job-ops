import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import * as jobsRepo from "../../../repositories/jobs";
import * as settingsRepo from "../../../repositories/settings";
import { formatStats } from "../formatting";
import { getStreakData } from "../streaks";

export function registerStatsHandlers(bot: Bot): void {
  bot.callbackQuery("s:stats", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const stats = await jobsRepo.getJobStats();
      let text = formatStats(stats);

      // Streak data
      const tz = await settingsRepo.getSetting("userTimezone") || "Europe/Berlin";
      const streak = await getStreakData(tz);

      text += "\n\n<b>🔥 Activity</b>\n";
      text += `🔥 Streak: ${streak.currentStreak} day${streak.currentStreak !== 1 ? "s" : ""}`;
      if (streak.streakAtRisk) text += " ⚠️ at risk!";
      text += "\n";
      text += `📅 This week: ${streak.weekCount} applied\n`;
      text += `🏆 Longest streak: ${streak.longestStreak} days\n`;
      if (streak.isActiveToday) {
        text += `✅ Today: ${streak.todayCount} applied`;
      } else {
        text += `⏳ Today: not yet applied`;
      }

      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("◀️ Back", "m:menu"),
      });
    } catch (err) {
      console.error("Stats error:", err);
      await ctx.answerCallbackQuery("❌ Error loading stats").catch(() => {});
    }
  });
}

import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import * as jobsRepo from "../../../repositories/jobs";
import { formatStats } from "../formatting";

export function registerStatsHandlers(bot: Bot): void {
  bot.callbackQuery("s:stats", async (ctx) => {
    await ctx.answerCallbackQuery();
    const stats = await jobsRepo.getJobStats();
    const text = formatStats(stats);

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("◀️ Back", "m:menu"),
    });
  });
}

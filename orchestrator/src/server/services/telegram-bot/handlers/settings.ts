import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import * as settingsRepo from "../../../repositories/settings";
import { initializePipelineScheduler, getPipelineSchedulerStatus } from "../../pipeline-scheduler";
import { generateLinkCode } from "../auth";

export function registerSettingsHandlers(bot: Bot): void {
  // Settings menu
  bot.callbackQuery("x:menu", async (ctx) => {
    await ctx.answerCallbackQuery();

    const scheduleEnabled = (await settingsRepo.getSetting("pipelineScheduleEnabled")) === "1" ||
      (await settingsRepo.getSetting("pipelineScheduleEnabled")) === "true";
    const scheduleHour = await settingsRepo.getSetting("pipelineScheduleHour") || "8";
    const notifEnabled = (await settingsRepo.getSetting("telegramNotificationsEnabled")) !== "0" &&
      (await settingsRepo.getSetting("telegramNotificationsEnabled")) !== "false";
    const scheduler = getPipelineSchedulerStatus();

    let text = "<b>⚙️ Settings</b>\n\n";
    text += `Pipeline Schedule: ${scheduleEnabled ? `✅ Enabled (${scheduleHour}:00 UTC)` : "❌ Disabled"}\n`;
    if (scheduler.nextRun) text += `Next run: ${scheduler.nextRun}\n`;
    text += `Notifications: ${notifEnabled ? "✅ Enabled" : "🔕 Disabled"}\n`;

    const keyboard = new InlineKeyboard()
      .text(scheduleEnabled ? "⏹ Disable Schedule" : "▶️ Enable Schedule", "x:sched")
      .row()
      .text(notifEnabled ? "🔕 Mute Notifications" : "🔔 Unmute", "x:notif")
      .row()
      .text("🔗 Generate Link Code", "x:link")
      .row()
      .text("◀️ Back", "m:menu");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Toggle schedule
  bot.callbackQuery("x:sched", async (ctx) => {
    const current = (await settingsRepo.getSetting("pipelineScheduleEnabled")) === "1" ||
      (await settingsRepo.getSetting("pipelineScheduleEnabled")) === "true";
    const newValue = !current;

    await settingsRepo.setSetting("pipelineScheduleEnabled", newValue ? "1" : "0");
    await initializePipelineScheduler();

    await ctx.answerCallbackQuery(newValue ? "Schedule enabled!" : "Schedule disabled!");

    // Refresh settings panel
    const keyboard = new InlineKeyboard().text("◀️ Settings", "x:menu").text("◀️ Menu", "m:menu");
    await ctx.editMessageText(
      `✅ Pipeline schedule ${newValue ? "enabled" : "disabled"}.`,
      { reply_markup: keyboard },
    );
  });

  // Toggle notifications
  bot.callbackQuery("x:notif", async (ctx) => {
    const current = (await settingsRepo.getSetting("telegramNotificationsEnabled")) !== "0" &&
      (await settingsRepo.getSetting("telegramNotificationsEnabled")) !== "false";
    const newValue = !current;

    await settingsRepo.setSetting("telegramNotificationsEnabled", newValue ? "1" : "0");

    await ctx.answerCallbackQuery(newValue ? "Notifications enabled!" : "Notifications muted!");
    const keyboard = new InlineKeyboard().text("◀️ Settings", "x:menu").text("◀️ Menu", "m:menu");
    await ctx.editMessageText(
      `${newValue ? "🔔" : "🔕"} Notifications ${newValue ? "enabled" : "muted"}.`,
      { reply_markup: keyboard },
    );
  });

  // Generate link code
  bot.callbackQuery("x:link", async (ctx) => {
    const code = generateLinkCode();
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `<b>🔗 Link Code</b>\n\n<code>${code}</code>\n\nSend this to another user. Expires in 5 minutes.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("◀️ Settings", "x:menu"),
      },
    );
  });

  // Back to main menu
  bot.callbackQuery("m:menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { sendMainMenu } = await import("../bot");
    // Can't easily reuse sendMainMenu with editMessage, so rebuild
    const { getJobStats } = await import("../../../repositories/jobs");
    const stats = await getJobStats();
    const ready = stats.ready || 0;
    const applied = stats.applied || 0;
    const discovered = stats.discovered || 0;

    const text =
      `<b>🏠 Job Ops — Command Center</b>\n\n` +
      `📋 ${ready} ready · ${applied} applied · ${discovered} discovered`;

    const keyboard = new InlineKeyboard()
      .text("🔍 Pipeline", "p:status")
      .text("📋 Jobs", "j:ready:0")
      .row()
      .text("🚀 Auto Apply", "a:status")
      .text("📊 Stats", "s:stats")
      .row()
      .text("⚙️ Settings", "x:menu");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });
}

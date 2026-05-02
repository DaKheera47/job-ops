import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import * as settingsRepo from "../../../repositories/settings";
import { initializePipelineScheduler, getPipelineSchedulerStatus } from "../../pipeline-scheduler";
import { generateLinkCode } from "../auth";

export function registerSettingsHandlers(bot: Bot): void {
  // Settings menu
  bot.callbackQuery("x:menu", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();

      const schedVal = await settingsRepo.getSetting("pipelineScheduleEnabled");
      const scheduleEnabled = schedVal === "1" || schedVal === "true";
      const scheduleHour = await settingsRepo.getSetting("pipelineScheduleHour") || "8";
      const notifVal = await settingsRepo.getSetting("telegramNotificationsEnabled");
      const notifEnabled = notifVal !== "0" && notifVal !== "false";
      const scheduler = getPipelineSchedulerStatus();

      let text = "<b>⚙️ Settings</b>\n\n";
      text += `Pipeline Schedule: ${scheduleEnabled ? `✅ Enabled (${scheduleHour}:00 UTC)` : "❌ Disabled"}\n`;
      if (scheduler.nextRun) text += `Next run: ${scheduler.nextRun}\n`;
      text += `Notifications: ${notifEnabled ? "✅ Enabled" : "🔕 Disabled"}\n`;

      const keyboard = new InlineKeyboard()
        .text(scheduleEnabled ? "⏹ Disable Schedule" : "▶️ Enable Schedule", "x:sched")
        .text(`🕐 Set Time (${scheduleHour}:00)`, "x:time")
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
    } catch (err) {
      console.error("Settings menu error:", err);
      await ctx.answerCallbackQuery("❌ Error loading settings").catch(() => {});
    }
  });

  // Toggle schedule
  bot.callbackQuery("x:sched", async (ctx) => {
    try {
      const schedVal = await settingsRepo.getSetting("pipelineScheduleEnabled");
      const current = schedVal === "1" || schedVal === "true";
      const newValue = !current;

      await settingsRepo.setSetting("pipelineScheduleEnabled", newValue ? "1" : "0");
      await initializePipelineScheduler();

      await ctx.answerCallbackQuery(newValue ? "Schedule enabled!" : "Schedule disabled!");

      const keyboard = new InlineKeyboard().text("◀️ Settings", "x:menu").text("◀️ Menu", "m:menu");
      await ctx.editMessageText(
        `✅ Pipeline schedule ${newValue ? "enabled" : "disabled"}.`,
        { reply_markup: keyboard },
      );
    } catch (err) {
      console.error("Toggle schedule error:", err);
      await ctx.answerCallbackQuery("❌ Error toggling schedule").catch(() => {});
    }
  });

  // Toggle notifications
  bot.callbackQuery("x:notif", async (ctx) => {
    try {
      const notifVal = await settingsRepo.getSetting("telegramNotificationsEnabled");
      const current = notifVal !== "0" && notifVal !== "false";
      const newValue = !current;

      await settingsRepo.setSetting("telegramNotificationsEnabled", newValue ? "1" : "0");

      await ctx.answerCallbackQuery(newValue ? "Notifications enabled!" : "Notifications muted!");
      const keyboard = new InlineKeyboard().text("◀️ Settings", "x:menu").text("◀️ Menu", "m:menu");
      await ctx.editMessageText(
        `${newValue ? "🔔" : "🔕"} Notifications ${newValue ? "enabled" : "muted"}.`,
        { reply_markup: keyboard },
      );
    } catch (err) {
      console.error("Toggle notifications error:", err);
      await ctx.answerCallbackQuery("❌ Error toggling notifications").catch(() => {});
    }
  });

  // Time picker — show hour grid
  bot.callbackQuery("x:time", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const currentHour = await settingsRepo.getSetting("pipelineScheduleHour") || "8";

      const keyboard = new InlineKeyboard();
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          const h = row * 6 + col;
          const label = h === parseInt(currentHour, 10) ? `[${h}:00]` : `${h}:00`;
          keyboard.text(label, `x:h:${h}`);
        }
        keyboard.row();
      }
      keyboard.text("◀️ Back", "x:menu");

      await ctx.editMessageText(
        `<b>🕐 Set Pipeline Schedule Time (UTC)</b>\n\nCurrent: <b>${currentHour}:00 UTC</b>\n\nPick an hour:`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    } catch (err) {
      console.error("Time picker error:", err);
      await ctx.answerCallbackQuery("❌ Error loading time picker").catch(() => {});
    }
  });

  // Set specific hour
  bot.callbackQuery(/^x:h:(\d+)$/, async (ctx) => {
    try {
      const hour = parseInt(ctx.match![1], 10);
      if (hour < 0 || hour > 23) {
        await ctx.answerCallbackQuery("Invalid hour");
        return;
      }

      await settingsRepo.setSetting("pipelineScheduleHour", String(hour));
      await initializePipelineScheduler();
      await ctx.answerCallbackQuery(`Schedule set to ${hour}:00 UTC`);

      await ctx.editMessageText(
        `✅ Pipeline schedule time set to <b>${hour}:00 UTC</b>`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("◀️ Settings", "x:menu").text("◀️ Menu", "m:menu"),
        },
      );
    } catch (err) {
      console.error("Set hour error:", err);
      await ctx.answerCallbackQuery("❌ Error setting hour").catch(() => {});
    }
  });

  // Generate link code
  bot.callbackQuery("x:link", async (ctx) => {
    try {
      const code = generateLinkCode();
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `<b>🔗 Link Code</b>\n\n<code>${code}</code>\n\nSend this to another user. Expires in 5 minutes.`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("◀️ Settings", "x:menu"),
        },
      );
    } catch (err) {
      console.error("Link code error:", err);
      await ctx.answerCallbackQuery("❌ Error generating link code").catch(() => {});
    }
  });

  // Back to main menu
  bot.callbackQuery("m:menu", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const { sendMainMenu } = await import("../bot");
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
    } catch (err) {
      console.error("Main menu error:", err);
      await ctx.answerCallbackQuery("❌ Error loading menu").catch(() => {});
    }
  });
}

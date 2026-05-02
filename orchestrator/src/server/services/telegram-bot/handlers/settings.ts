import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import * as settingsRepo from "../../../repositories/settings";
import { initializePipelineScheduler, getPipelineSchedulerStatus } from "../../pipeline-scheduler";
import { generateLinkCode } from "../auth";
import { escapeHtml } from "../formatting";

const TIMEZONES = [
  { label: "London (GMT)", tz: "Europe/London" },
  { label: "Berlin (CET)", tz: "Europe/Berlin" },
  { label: "Moscow (MSK)", tz: "Europe/Moscow" },
  { label: "Dubai (GST)", tz: "Asia/Dubai" },
  { label: "Mumbai (IST)", tz: "Asia/Kolkata" },
  { label: "Singapore (SGT)", tz: "Asia/Singapore" },
  { label: "Tokyo (JST)", tz: "Asia/Tokyo" },
  { label: "Sydney (AEST)", tz: "Australia/Sydney" },
  { label: "New York (EST)", tz: "America/New_York" },
  { label: "Chicago (CST)", tz: "America/Chicago" },
  { label: "Denver (MST)", tz: "America/Denver" },
  { label: "LA (PST)", tz: "America/Los_Angeles" },
];

function formatTimeInTz(hour: number, tz: string): string {
  try {
    const d = new Date();
    d.setUTCHours(hour, 0, 0, 0);
    return d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  } catch {
    return `${hour}:00`;
  }
}

function getTzShortLabel(tz: string): string {
  const entry = TIMEZONES.find((t) => t.tz === tz);
  return entry ? entry.label : tz;
}

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
      const userTz = await settingsRepo.getSetting("userTimezone") || "Europe/Berlin";
      const scheduler = getPipelineSchedulerStatus();

      const hour = parseInt(scheduleHour, 10);
      const localTime = formatTimeInTz(hour, userTz);
      const tzLabel = getTzShortLabel(userTz);

      let text = "<b>⚙️ Settings</b>\n\n";
      text += `🕐 Pipeline: ${scheduleEnabled ? `✅ ${localTime} (${tzLabel})` : "❌ Disabled"}\n`;
      if (scheduler.nextRun) text += `Next run: ${scheduler.nextRun}\n`;
      text += `🌍 Timezone: ${tzLabel}\n`;
      text += `🔔 Notifications: ${notifEnabled ? "✅ Enabled" : "🔕 Disabled"}\n`;

      const keyboard = new InlineKeyboard()
        .text(scheduleEnabled ? "⏹ Disable" : "▶️ Enable", "x:sched")
        .text(`🕐 Time (${localTime})`, "x:time")
        .row()
        .text(`🌍 Timezone`, "x:tz")
        .text(notifEnabled ? "🔕 Mute" : "🔔 Unmute", "x:notif")
        .row()
        .text("🔗 Link Code", "x:link")
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

  // Timezone picker
  bot.callbackQuery("x:tz", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const currentTz = await settingsRepo.getSetting("userTimezone") || "Europe/Berlin";

      const keyboard = new InlineKeyboard();
      for (let i = 0; i < TIMEZONES.length; i++) {
        const { label, tz } = TIMEZONES[i];
        const display = tz === currentTz ? `[${label}]` : label;
        keyboard.text(display, `x:tz:${i}`);
        if (i % 2 === 1) keyboard.row();
      }
      if (TIMEZONES.length % 2 === 1) keyboard.row();
      keyboard.text("◀️ Back", "x:menu");

      await ctx.editMessageText(
        `<b>🌍 Select Timezone</b>\n\nCurrent: <b>${escapeHtml(getTzShortLabel(currentTz))}</b>`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    } catch (err) {
      console.error("Timezone picker error:", err);
      await ctx.answerCallbackQuery("❌ Error loading timezones").catch(() => {});
    }
  });

  // Set timezone
  bot.callbackQuery(/^x:tz:(\d+)$/, async (ctx) => {
    try {
      const idx = parseInt(ctx.match![1], 10);
      const entry = TIMEZONES[idx];
      if (!entry) {
        await ctx.answerCallbackQuery("Invalid timezone");
        return;
      }

      await settingsRepo.setSetting("userTimezone", entry.tz);
      await ctx.answerCallbackQuery(`Timezone set to ${entry.label}`);

      await ctx.editMessageText(
        `✅ Timezone set to <b>${escapeHtml(entry.label)}</b>`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("◀️ Settings", "x:menu").text("◀️ Menu", "m:menu"),
        },
      );
    } catch (err) {
      console.error("Set timezone error:", err);
      await ctx.answerCallbackQuery("❌ Error setting timezone").catch(() => {});
    }
  });

  // Time picker — show hour grid
  bot.callbackQuery("x:time", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const currentHour = await settingsRepo.getSetting("pipelineScheduleHour") || "8";
      const userTz = await settingsRepo.getSetting("userTimezone") || "Europe/Berlin";
      const tzLabel = getTzShortLabel(userTz);

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

      const currentLocalTime = formatTimeInTz(parseInt(currentHour, 10), userTz);

      await ctx.editMessageText(
        `<b>🕐 Set Pipeline Schedule Time</b>\n\nCurrent: <b>${currentLocalTime} (${escapeHtml(tzLabel)})</b>\n\nPick an hour (UTC):`,
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

      const userTz = await settingsRepo.getSetting("userTimezone") || "Europe/Berlin";
      const localTime = formatTimeInTz(hour, userTz);
      const tzLabel = getTzShortLabel(userTz);

      await ctx.answerCallbackQuery(`Schedule set to ${localTime}`);

      await ctx.editMessageText(
        `✅ Pipeline schedule set to <b>${localTime} (${escapeHtml(tzLabel)})</b>`,
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
      const { getJobStats } = await import("../../../repositories/jobs");
      const stats = await getJobStats();
      const ready = stats.ready || 0;
      const applied = stats.applied || 0;
      const discovered = stats.discovered || 0;

      const name = ctx.from?.first_name || "";
      const greeting = name ? ` ${escapeHtml(name)}` : "";

      const text =
        `<b>🏠 Job Ops${greeting}</b>\n\n` +
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

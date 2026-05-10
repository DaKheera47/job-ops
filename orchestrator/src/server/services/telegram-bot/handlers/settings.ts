import { logger } from "@infra/logger";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import * as settingsRepo from "../../../repositories/settings";
import { initializePipelineScheduler, getPipelineSchedulerStatus } from "../../pipeline-scheduler";
import { generateLinkCode } from "../auth";
import { awaitingInput } from "../awaiting-input";
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

function formatLocalHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatInstantInTz(iso: string, tz: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      timeZone: tz,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getTzShortLabel(tz: string): string {
  const entry = TIMEZONES.find((t) => t.tz === tz);
  return entry ? entry.label : tz;
}

// Shared awaiting-input state lives in ../awaiting-input. We prefix actions
// with "settings:" so other handlers' middleware ignores our prompts.
const BLOCKED_PAGE_SIZE = 8;

function parseBlockedKeywords(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
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
      const localTime = formatLocalHour(hour);
      const tzLabel = getTzShortLabel(userTz);
      const nextRunLocal = scheduler.nextRun
        ? formatInstantInTz(scheduler.nextRun, userTz)
        : null;

      let text = "<b>⚙️ Settings</b>\n\n";
      text += `🕐 Pipeline: ${scheduleEnabled ? `✅ ${localTime} (${tzLabel})` : "❌ Disabled"}\n`;
      if (nextRunLocal) text += `Next run: ${nextRunLocal} (${tzLabel})\n`;
      text += `🌍 Timezone: ${tzLabel}\n`;
      text += `🔔 Notifications: ${notifEnabled ? "✅ Enabled" : "🔕 Disabled"}\n`;

      const keyboard = new InlineKeyboard()
        .text(scheduleEnabled ? "⏹ Disable" : "▶️ Enable", "x:sched")
        .text(`🕐 Time (${localTime})`, "x:time")
        .row()
        .text(`🌍 Timezone`, "x:tz")
        .text(notifEnabled ? "🔕 Mute" : "🔔 Unmute", "x:notif")
        .row()
        .text("📡 Boards", "b:menu")
        .text("🚫 Blocked Companies", "x:blocked:0")
        .row()
        .text("🔗 Link Code", "x:link")
        .row()
        .text("◀️ Back", "m:menu");

      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (err) {
      logger.error("Settings menu error", { error: err instanceof Error ? err.message : String(err) });
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
      logger.error("Toggle schedule error", { error: err instanceof Error ? err.message : String(err) });
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
      logger.error("Toggle notifications error", { error: err instanceof Error ? err.message : String(err) });
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
      logger.error("Timezone picker error", { error: err instanceof Error ? err.message : String(err) });
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
      logger.error("Set timezone error", { error: err instanceof Error ? err.message : String(err) });
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

      const currentLocalTime = formatLocalHour(parseInt(currentHour, 10));

      await ctx.editMessageText(
        `<b>🕐 Set Pipeline Schedule Time</b>\n\nCurrent: <b>${currentLocalTime} (${escapeHtml(tzLabel)})</b>\n\nPick an hour in <b>${escapeHtml(tzLabel)}</b>:`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    } catch (err) {
      logger.error("Time picker error", { error: err instanceof Error ? err.message : String(err) });
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
      const localTime = formatLocalHour(hour);
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
      logger.error("Set hour error", { error: err instanceof Error ? err.message : String(err) });
      await ctx.answerCallbackQuery("❌ Error setting hour").catch(() => {});
    }
  });

  // Generate link code
  bot.callbackQuery("x:link", async (ctx) => {
    try {
      const code = generateLinkCode();
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `<b>🔗 Link Code</b>\n\n<code>${code}</code>\n\n<i>Tap the code above to copy it.</i>\n\nSend this to another user. Expires in 5 minutes.`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("◀️ Settings", "x:menu"),
        },
      );
    } catch (err) {
      logger.error("Link code error", { error: err instanceof Error ? err.message : String(err) });
      await ctx.answerCallbackQuery("❌ Error generating link code").catch(() => {});
    }
  });

  // ── Blocked Companies ─────────────────────────────────────────────

  // List blocked companies (paginated)
  bot.callbackQuery(/^x:blocked:(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const page = parseInt(ctx.match![1], 10);
      const raw = await settingsRepo.getSetting("blockedCompanyKeywords");
      const keywords = parseBlockedKeywords(raw);

      const totalPages = Math.max(1, Math.ceil(keywords.length / BLOCKED_PAGE_SIZE));
      const safePage = Math.min(page, totalPages - 1);
      const pageItems = keywords.slice(
        safePage * BLOCKED_PAGE_SIZE,
        (safePage + 1) * BLOCKED_PAGE_SIZE,
      );

      let text = `<b>🚫 Blocked Companies (${keywords.length})</b>\n\n`;
      if (keywords.length === 0) {
        text += "<i>No blocked companies yet.</i>\n";
        text += "Companies matching these keywords will be filtered out during pipeline discovery.";
      } else {
        for (let i = 0; i < pageItems.length; i++) {
          const globalIdx = safePage * BLOCKED_PAGE_SIZE + i;
          text += `${globalIdx + 1}. ${escapeHtml(pageItems[i])}\n`;
        }
      }

      const keyboard = new InlineKeyboard();

      // Remove buttons — one per item on the page
      for (let i = 0; i < pageItems.length; i++) {
        const globalIdx = safePage * BLOCKED_PAGE_SIZE + i;
        const label = `❌ ${pageItems[i].slice(0, 20)}`;
        keyboard.text(label, `x:bl:rm:${globalIdx}`);
        if (i % 2 === 1) keyboard.row();
      }
      if (pageItems.length % 2 === 1) keyboard.row();

      // Pagination
      if (totalPages > 1) {
        if (safePage > 0) keyboard.text("◀️", `x:blocked:${safePage - 1}`);
        keyboard.text(`${safePage + 1}/${totalPages}`, "noop");
        if (safePage < totalPages - 1) keyboard.text("▶️", `x:blocked:${safePage + 1}`);
        keyboard.row();
      }

      keyboard.text("➕ Add", "x:bl:add");
      if (keywords.length > 0) keyboard.text("🗑 Clear All", "x:bl:clear");
      keyboard.row().text("◀️ Settings", "x:menu");

      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err) {
      logger.error("Blocked companies list error", { error: err instanceof Error ? err.message : String(err) });
      await ctx.answerCallbackQuery("❌ Error loading blocked companies").catch(() => {});
    }
  });

  // Add blocked company — prompt for text input
  bot.callbackQuery("x:bl:add", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      awaitingInput.set(chatId, "settings:blocked_company");

      const text =
        "<b>🚫 Add Blocked Companies</b>\n\n" +
        "Send company name(s), comma-separated:\n" +
        "<i>e.g. Acme Corp, Globex, Initech</i>\n\n" +
        "Jobs from companies matching these keywords will be filtered out.";

      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("◀️ Back", "x:blocked:0"),
      });
    } catch (err) {
      logger.error("Add blocked prompt error", { error: err instanceof Error ? err.message : String(err) });
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // Remove single blocked keyword
  bot.callbackQuery(/^x:bl:rm:(\d+)$/, async (ctx) => {
    try {
      const idx = parseInt(ctx.match![1], 10);
      const raw = await settingsRepo.getSetting("blockedCompanyKeywords");
      const keywords = parseBlockedKeywords(raw);

      if (idx < 0 || idx >= keywords.length) {
        await ctx.answerCallbackQuery("Invalid index");
        return;
      }

      const removed = keywords.splice(idx, 1)[0];
      await settingsRepo.setSetting("blockedCompanyKeywords", JSON.stringify(keywords));
      await ctx.answerCallbackQuery(`Removed: ${removed}`);

      // Re-render the list at page 0
      const keyboard = new InlineKeyboard()
        .text("🚫 Blocked Companies", "x:blocked:0")
        .text("◀️ Settings", "x:menu");
      await ctx.editMessageText(
        `✅ Removed <b>${escapeHtml(removed)}</b> from blocked list.`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    } catch (err) {
      logger.error("Remove blocked keyword error", { error: err instanceof Error ? err.message : String(err) });
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // Clear all blocked keywords — confirmation step
  bot.callbackQuery("x:bl:clear", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const raw = await settingsRepo.getSetting("blockedCompanyKeywords");
      const keywords = parseBlockedKeywords(raw);
      if (keywords.length === 0) {
        await ctx.answerCallbackQuery("Nothing to clear").catch(() => {});
        return;
      }

      const keyboard = new InlineKeyboard()
        .text(`🗑 Yes, clear ${keywords.length}`, "x:bl:clear:do")
        .text("◀️ Cancel", "x:blocked:0");
      await ctx.editMessageText(
        `🗑 <b>Clear all blocked companies?</b>\n\n<i>${keywords.length} keyword(s) will be removed. Cannot be undone.</i>`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    } catch (err) {
      logger.error("Clear blocked confirm error", { error: err instanceof Error ? err.message : String(err) });
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // Clear all blocked keywords — confirmed
  bot.callbackQuery("x:bl:clear:do", async (ctx) => {
    try {
      await settingsRepo.setSetting("blockedCompanyKeywords", "[]");
      await ctx.answerCallbackQuery("All blocked companies cleared!");
      await ctx.editMessageText("✅ All blocked companies cleared.", {
        reply_markup: new InlineKeyboard().text("◀️ Settings", "x:menu").text("◀️ Menu", "m:menu"),
      });
    } catch (err) {
      logger.error("Clear blocked error", { error: err instanceof Error ? err.message : String(err) });
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // ── Text input handler (blocked companies) ────────────────────────

  bot.on("message:text", async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();

    const action = awaitingInput.get(chatId);
    if (!action || !action.startsWith("settings:")) return next();
    awaitingInput.delete(chatId);

    const subAction = action.slice("settings:".length);

    try {
      if (subAction === "blocked_company") {
        const newKeywords = ctx.message.text
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);

        if (newKeywords.length === 0) {
          await ctx.reply("No keywords provided.", {
            reply_markup: new InlineKeyboard().text("🚫 Blocked Companies", "x:blocked:0"),
          });
          return;
        }

        const raw = await settingsRepo.getSetting("blockedCompanyKeywords");
        const existing = parseBlockedKeywords(raw);
        const existingSet = new Set(existing.map((k) => k.toLowerCase()));
        const added: string[] = [];

        for (const kw of newKeywords) {
          if (!existingSet.has(kw)) {
            existing.push(kw);
            existingSet.add(kw);
            added.push(kw);
          }
        }

        await settingsRepo.setSetting("blockedCompanyKeywords", JSON.stringify(existing));

        const keyboard = new InlineKeyboard()
          .text("🚫 Blocked Companies", "x:blocked:0")
          .row()
          .text("◀️ Menu", "m:menu");

        if (added.length > 0) {
          await ctx.reply(
            `✅ Added: <b>${escapeHtml(added.join(", "))}</b>\nTotal blocked: ${existing.length}`,
            { parse_mode: "HTML", reply_markup: keyboard },
          );
        } else {
          await ctx.reply("All keywords already in the blocklist.", { reply_markup: keyboard });
        }
        return;
      }
    } catch (err) {
      logger.error("Text input handler error", { error: err instanceof Error ? err.message : String(err) });
      await ctx.reply("❌ Error saving setting.").catch(() => {});
    }

    return next();
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
      logger.error("Main menu error", { error: err instanceof Error ? err.message : String(err) });
      await ctx.answerCallbackQuery("❌ Error loading menu").catch(() => {});
    }
  });
}

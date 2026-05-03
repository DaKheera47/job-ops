import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { runWithRequestContext } from "@infra/request-context";
import {
  runPipeline,
  requestPipelineCancel,
  getPipelineStatus,
} from "../../../pipeline/orchestrator";
import * as settingsRepo from "../../../repositories/settings";
import { subscribeToProgress, getProgress } from "../../../pipeline/progress";
import { getPipelineSchedulerStatus } from "../../pipeline-scheduler";
import { formatPipelineProgress, escapeHtml } from "../formatting";

// Shared state for text input collection
export const awaitingPipelineInput = new Map<number, string>();

const SCOPE_OPTIONS = [
  { label: "📍 Selected Only", value: "selected_only" },
  { label: "📍 Selected + Remote", value: "selected_plus_remote_worldwide" },
  { label: "🌍 Remote Worldwide", value: "remote_worldwide_prioritize_selected" },
];

const STRICTNESS_OPTIONS = [
  { label: "🎯 Exact Only", value: "exact_only" },
  { label: "🎯 Flexible", value: "flexible" },
];

function scopeLabel(value: string): string {
  return SCOPE_OPTIONS.find((o) => o.value === value)?.label || value;
}

function strictnessLabel(value: string): string {
  return STRICTNESS_OPTIONS.find((o) => o.value === value)?.label || value;
}

async function buildConfigText(): Promise<string> {
  const searchTermsRaw = await settingsRepo.getSetting("searchTerms");
  let keywords: string[] = [];
  if (searchTermsRaw) {
    try { keywords = JSON.parse(searchTermsRaw); } catch { /* empty */ }
  }

  const location = await settingsRepo.getSetting("searchCities") || "Not set";
  const country = await settingsRepo.getSetting("jobspyCountryIndeed") || "";
  const scope = await settingsRepo.getSetting("locationSearchScope") || "selected_only";
  const strictness = await settingsRepo.getSetting("locationMatchStrictness") || "exact_only";

  let text = "<b>🔍 Pipeline — Review Config</b>\n\n";
  text += `📝 <b>Search Terms:</b> ${keywords.length > 0 ? escapeHtml(keywords.join(", ")) : "<i>Not set</i>"}\n`;
  text += `📍 <b>Location:</b> ${escapeHtml(location)}${country ? ` (${escapeHtml(country)})` : ""}\n`;
  text += `🌐 <b>Scope:</b> ${escapeHtml(scopeLabel(scope))}\n`;
  text += `🎯 <b>Strictness:</b> ${escapeHtml(strictnessLabel(strictness))}\n`;
  text += `\n<i>Edit settings or run with current config:</i>`;
  return text;
}

function buildConfigKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📝 Search Terms", "p:edit:kw")
    .text("📍 Location", "p:edit:loc")
    .row()
    .text("🌐 Scope", "p:edit:scope")
    .text("🎯 Strictness", "p:edit:strict")
    .row()
    .text("▶️ Run Pipeline", "p:confirm")
    .row()
    .text("◀️ Back", "m:menu");
}

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

      const keyboard = new InlineKeyboard()
        .text("⏹ Cancel", "p:cancel")
        .row()
        .text("◀️ Back", "m:menu");

      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      return;
    }

    text += "Status: Idle\n";
    if (scheduler.enabled && scheduler.nextRun) {
      text += `\n⏰ Next run: ${scheduler.nextRun}`;
    } else {
      text += "\n⏰ Schedule: Disabled";
    }

    const keyboard = new InlineKeyboard()
      .text("▶️ Run Now", "p:run")
      .row()
      .text("◀️ Back", "m:menu");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Pre-run config review screen
  bot.callbackQuery("p:run", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const text = await buildConfigText();
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: buildConfigKeyboard(),
      });
    } catch (err) {
      console.error("Pipeline config screen error:", err);
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // ── Inline editors ────────────────────────────────────────────────

  // Edit search terms — prompt for text input
  bot.callbackQuery("p:edit:kw", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      awaitingPipelineInput.set(chatId, "searchTerms");

      const searchTermsRaw = await settingsRepo.getSetting("searchTerms");
      let keywords: string[] = [];
      if (searchTermsRaw) {
        try { keywords = JSON.parse(searchTermsRaw); } catch { /* empty */ }
      }

      let text = "<b>📝 Search Terms</b>\n\n";
      if (keywords.length > 0) {
        text += `Current: <b>${escapeHtml(keywords.join(", "))}</b>\n\n`;
      }
      text += "Send your search terms, comma-separated:\n";
      text += "<i>e.g. Program Manager, Senior Program Manager, Technical PM</i>";

      const keyboard = new InlineKeyboard().text("◀️ Back", "p:run");
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err) {
      console.error("Edit search terms error:", err);
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // Edit location — prompt for text input
  bot.callbackQuery("p:edit:loc", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      awaitingPipelineInput.set(chatId, "location");

      const current = await settingsRepo.getSetting("searchCities") || "";
      let text = "<b>📍 Location</b>\n\n";
      if (current) {
        text += `Current: <b>${escapeHtml(current)}</b>\n\n`;
      }
      text += "Send your city or location:\n";
      text += "<i>e.g. Munich, Tel Aviv, London</i>";

      const keyboard = new InlineKeyboard().text("◀️ Back", "p:run");
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err) {
      console.error("Edit location error:", err);
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // Scope picker
  bot.callbackQuery("p:edit:scope", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const current = await settingsRepo.getSetting("locationSearchScope") || "selected_only";

      const keyboard = new InlineKeyboard();
      for (let i = 0; i < SCOPE_OPTIONS.length; i++) {
        const opt = SCOPE_OPTIONS[i];
        const display = opt.value === current ? `[${opt.label}]` : opt.label;
        keyboard.text(display, `p:sc:${i}`).row();
      }
      keyboard.text("◀️ Back", "p:run");

      await ctx.editMessageText(
        `<b>🌐 Location Scope</b>\n\nCurrent: <b>${escapeHtml(scopeLabel(current))}</b>`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    } catch (err) {
      console.error("Scope picker error:", err);
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // Set scope
  bot.callbackQuery(/^p:sc:(\d+)$/, async (ctx) => {
    try {
      const idx = parseInt(ctx.match![1], 10);
      const opt = SCOPE_OPTIONS[idx];
      if (!opt) { await ctx.answerCallbackQuery("Invalid option"); return; }

      await settingsRepo.setSetting("locationSearchScope", opt.value);
      await ctx.answerCallbackQuery(`Scope: ${opt.label}`);

      // Return to config review
      const text = await buildConfigText();
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: buildConfigKeyboard(),
      });
    } catch (err) {
      console.error("Set scope error:", err);
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // Strictness picker
  bot.callbackQuery("p:edit:strict", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const current = await settingsRepo.getSetting("locationMatchStrictness") || "exact_only";

      const keyboard = new InlineKeyboard();
      for (let i = 0; i < STRICTNESS_OPTIONS.length; i++) {
        const opt = STRICTNESS_OPTIONS[i];
        const display = opt.value === current ? `[${opt.label}]` : opt.label;
        keyboard.text(display, `p:st:${i}`);
      }
      keyboard.row().text("◀️ Back", "p:run");

      await ctx.editMessageText(
        `<b>🎯 Match Strictness</b>\n\nCurrent: <b>${escapeHtml(strictnessLabel(current))}</b>`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    } catch (err) {
      console.error("Strictness picker error:", err);
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // Set strictness
  bot.callbackQuery(/^p:st:(\d+)$/, async (ctx) => {
    try {
      const idx = parseInt(ctx.match![1], 10);
      const opt = STRICTNESS_OPTIONS[idx];
      if (!opt) { await ctx.answerCallbackQuery("Invalid option"); return; }

      await settingsRepo.setSetting("locationMatchStrictness", opt.value);
      await ctx.answerCallbackQuery(`Strictness: ${opt.label}`);

      // Return to config review
      const text = await buildConfigText();
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: buildConfigKeyboard(),
      });
    } catch (err) {
      console.error("Set strictness error:", err);
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // ── Text input handler for search terms and location ──────────────

  bot.on("message:text", async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();

    const action = awaitingPipelineInput.get(chatId);
    if (!action) return next();
    awaitingPipelineInput.delete(chatId);

    try {
      if (action === "searchTerms") {
        const terms = ctx.message.text
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        await settingsRepo.setSetting("searchTerms", JSON.stringify(terms));

        const text = await buildConfigText();
        await ctx.reply(text, {
          parse_mode: "HTML",
          reply_markup: buildConfigKeyboard(),
        });
        return;
      }

      if (action === "location") {
        const location = ctx.message.text.trim();
        await settingsRepo.setSetting("searchCities", location);

        const text = await buildConfigText();
        await ctx.reply(text, {
          parse_mode: "HTML",
          reply_markup: buildConfigKeyboard(),
        });
        return;
      }
    } catch (err) {
      console.error("Pipeline text input error:", err);
      await ctx.reply("❌ Error saving setting.").catch(() => {});
    }

    return next();
  });

  // ── Confirm & run pipeline ────────────────────────────────────────

  bot.callbackQuery("p:confirm", async (ctx) => {
    await ctx.answerCallbackQuery("Starting pipeline...");
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const statusMsg = await ctx.editMessageText(
      "<b>🔄 Pipeline Starting...</b>\n\nPreparing crawlers...",
      { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("⏹ Cancel", "p:cancel") },
    );

    const messageId = statusMsg.message_id;

    runWithRequestContext({}, async () => {
      let lastUpdate = 0;

      const unsubscribe = subscribeToProgress((progress) => {
        const now = Date.now();
        if (now - lastUpdate < 3000) return;
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
          .catch(() => {});
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

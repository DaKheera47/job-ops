import { logger } from "@infra/logger";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { runWithRequestContext } from "@infra/request-context";
import {
  COUNTRY_BOUND_DEFAULT_SOURCES,
  resolveAutoEnabledSources,
  sourceLabel,
} from "@shared/extractors";
import {
  runPipeline,
  requestPipelineCancel,
  resumePipelineScoring,
  getPipelineStatus,
} from "../../../pipeline/orchestrator";
import * as settingsRepo from "../../../repositories/settings";
import { subscribeToProgress, getProgress } from "../../../pipeline/progress";
import { getPipelineSchedulerStatus } from "../../pipeline-scheduler";
import { awaitingInput } from "../awaiting-input";
import { formatPipelineProgress, escapeHtml } from "../formatting";

const SCOPE_OPTIONS = [
  { label: "📍 Selected Only", value: "selected_only" },
  { label: "📍 Selected + Remote", value: "selected_plus_remote_worldwide" },
  { label: "🌍 Remote Worldwide", value: "remote_worldwide_prioritize_selected" },
];

const STRICTNESS_OPTIONS = [
  { label: "🎯 Exact Only", value: "exact_only" },
  { label: "🎯 Flexible", value: "flexible" },
];

function logErr(scope: string, err: unknown): void {
  logger.error(scope, { error: err instanceof Error ? err.message : String(err) });
}

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

  // Resolve the actual sources list the pipeline will use given the scope.
  const effectiveSources = resolveAutoEnabledSources({
    scope,
    baseSources: [...COUNTRY_BOUND_DEFAULT_SOURCES],
  });
  const baseSet = new Set<string>(COUNTRY_BOUND_DEFAULT_SOURCES);
  const remoteAdditions = effectiveSources.filter((id) => !baseSet.has(id));

  let text = "<b>🔍 Pipeline — Review Config</b>\n\n";
  text += `📝 <b>Search Terms:</b> ${keywords.length > 0 ? escapeHtml(keywords.join(", ")) : "<i>Not set</i>"}\n`;
  text += `📍 <b>Location:</b> ${escapeHtml(location)}${country ? ` (${escapeHtml(country)})` : ""}\n`;
  text += `🌐 <b>Scope:</b> ${escapeHtml(scopeLabel(scope))}\n`;
  text += `🎯 <b>Strictness:</b> ${escapeHtml(strictnessLabel(strictness))}\n`;
  text += `🔌 <b>Sources (${effectiveSources.length}):</b> ${escapeHtml(
    effectiveSources.map((id) => sourceLabel(id)).join(", "),
  )}\n`;
  if (remoteAdditions.length > 0) {
    text += `<i>↳ ${remoteAdditions.length} remote-friendly sources auto-enabled by scope</i>\n`;
  }
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
      logErr("Pipeline config screen error", err);
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
      awaitingInput.set(chatId, "pipeline:searchTerms");

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
      logErr("Edit search terms error", err);
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // Edit location — prompt for text input
  bot.callbackQuery("p:edit:loc", async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const chatId = ctx.chat?.id;
      if (!chatId) return;
      awaitingInput.set(chatId, "pipeline:location");

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
      logErr("Edit location error", err);
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

      const explainer =
        "\n\n<i>Selected + Remote / Remote Worldwide automatically pull jobs from WeWorkRemotely, Remotive, RemoteOK, Himalayas, JustJoin.it, NoFluffJobs, hh.ru and Working Nomads — no extra setup needed.</i>";

      await ctx.editMessageText(
        `<b>🌐 Location Scope</b>\n\nCurrent: <b>${escapeHtml(scopeLabel(current))}</b>${explainer}`,
        { parse_mode: "HTML", reply_markup: keyboard },
      );
    } catch (err) {
      logErr("Scope picker error", err);
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
      logErr("Set scope error", err);
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
      logErr("Strictness picker error", err);
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
      logErr("Set strictness error", err);
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });

  // ── Text input handler for search terms and location ──────────────

  bot.on("message:text", async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return next();

    const action = awaitingInput.get(chatId);
    if (!action || !action.startsWith("pipeline:")) return next();
    awaitingInput.delete(chatId);

    const subAction = action.slice("pipeline:".length);

    try {
      if (subAction === "searchTerms") {
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

      if (subAction === "location") {
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
      logErr("Pipeline text input error", err);
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

    // editMessageText returns `true` for inline-mode messages; in chat mode it
    // returns the edited Message. Bail out defensively rather than crash.
    if (statusMsg === true) return;
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
          .catch((err) => logErr("Pipeline progress edit error", err));
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
        .catch((e) => logErr("Pipeline error edit error", e));
    });
  });

  // Cancel pipeline
  bot.callbackQuery("p:cancel", async (ctx) => {
    requestPipelineCancel();
    await ctx.answerCallbackQuery("Cancelling pipeline...");
  });

  // Resume a pipeline paused on the LLM-config wait (either config error or
  // the transient-failure-rate escalation).  The orchestrator's
  // `resumePipelineScoring()` resolves the in-memory Promise; from there the
  // pipeline retries scoring exactly once.
  bot.callbackQuery("p:resume-scoring", async (ctx) => {
    const { resolved } = resumePipelineScoring();
    if (resolved) {
      await ctx.answerCallbackQuery("Resuming AI scoring…");
      // Update the message so the user sees we acted, without re-rendering
      // the whole pause card.
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      } catch {
        // Old message may be gone — fine.
      }
    } else {
      await ctx.answerCallbackQuery({
        text: "Pipeline isn't paused waiting on the AI right now.",
        show_alert: true,
      });
    }
  });
}

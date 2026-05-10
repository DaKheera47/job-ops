import { logger } from "@infra/logger";
import { Bot, type Context, InlineKeyboard } from "grammy";
import {
  addAuthorizedChatId,
  clearLinkAttempts,
  isAuthorized,
  registerLinkAttempt,
  validateLinkCode,
} from "./auth";
import { sendFullChangelog } from "./changelog-notifications";

let bot: Bot | null = null;

export function getBot(): Bot | null {
  return bot;
}

// Commands allowed before authorization. Match must be exact, or followed by
// whitespace / argument — so "/startfoo" never bypasses auth.
const PUBLIC_COMMANDS = new Set(["/start", "/link", "/help"]);

function extractCommand(text: string): string | null {
  if (!text.startsWith("/")) return null;
  // Strip optional @botname suffix and grab the command token.
  const token = text.split(/\s+/, 1)[0] ?? "";
  const stripped = token.split("@", 1)[0] ?? "";
  return stripped || null;
}

export function createBot(token: string): Bot {
  // Grammy uses fetch internally; HTTPS_PROXY env var is honoured by undici
  // via the global agent set up in Docker.
  const botInstance = new Bot(token);

  botInstance.catch((err) => {
    logger.error("Telegram bot error", {
      error: err.message,
      ctx: err.ctx?.update?.update_id,
    });
  });

  // Auth middleware — runs before all handlers
  botInstance.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const text = ctx.message?.text || "";
    const command = extractCommand(text);
    if (command && PUBLIC_COMMANDS.has(command)) {
      return next();
    }

    if (!(await isAuthorized(chatId))) {
      await ctx.reply(
        "🔒 Not authorized. Send /link <code> with your link code from Job Ops Settings.",
      );
      return;
    }

    return next();
  });

  // /start command
  botInstance.command("start", async (ctx) => {
    const chatId = ctx.chat.id;
    if (await isAuthorized(chatId)) {
      await sendMainMenu(ctx);
    } else {
      await ctx.reply(
        "👋 Welcome to Job Ops Bot!\n\n" +
          "To connect, get a link code from Job Ops Settings page, then send:\n" +
          "/link <code>",
      );
    }
  });

  // /link command — register chat ID
  botInstance.command("link", async (ctx) => {
    const chatId = ctx.chat.id;

    // Throttle brute-force attempts per-chat.
    const gate = registerLinkAttempt(chatId);
    if (!gate.allowed) {
      await ctx.reply(
        `⏳ Too many attempts. Try again in ~${Math.ceil((gate.retryInSeconds ?? 60) / 60)} min.`,
      );
      return;
    }

    const code = ctx.match?.trim();
    if (!code) {
      await ctx.reply("Usage: /link <code>\nGet the code from Job Ops Settings.");
      return;
    }

    if (validateLinkCode(code)) {
      clearLinkAttempts(chatId);
      await addAuthorizedChatId(chatId);
      await ctx.reply("✅ Linked successfully! You can now use the bot.");
      await sendMainMenu(ctx);
      // Send changelog to newly linked user so they know about recent features
      sendFullChangelog(chatId).catch((err) => {
        logger.warn("Failed to send full changelog to new user", {
          chatId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } else {
      await ctx.reply("❌ Invalid or expired code. Get a new one from Settings.");
    }
  });

  // /menu command
  botInstance.command("menu", async (ctx) => {
    await sendMainMenu(ctx);
  });

  // /changelog command — show full changelog history
  botInstance.command("changelog", async (ctx) => {
    await sendFullChangelog(ctx.chat.id);
  });

  // /search <query> — find jobs by title, employer, or location
  botInstance.command("search", async (ctx) => {
    const { searchJobs } = await import("../../repositories/jobs");
    const { escapeHtml, formatJobListItem } = await import("./formatting");

    const query = (ctx.match || "").trim();
    if (!query) {
      await ctx.reply(
        "Usage: <code>/search &lt;keyword&gt;</code>\n" +
          "<i>Searches across job title, company, and location.</i>\n" +
          "Examples: <code>/search Berlin</code>, <code>/search Senior PM</code>, <code>/search BMW</code>",
        { parse_mode: "HTML" },
      );
      return;
    }

    if (query.length < 2) {
      await ctx.reply("🔎 Query too short. Use at least 2 characters.");
      return;
    }

    try {
      const results = await searchJobs(query, 20);
      if (results.length === 0) {
        await ctx.reply(`🔎 No jobs match <b>${escapeHtml(query)}</b>.`, {
          parse_mode: "HTML",
        });
        return;
      }

      const text =
        `<b>🔎 Search: ${escapeHtml(query)} (${results.length})</b>\n\n` +
        results.map((j, i) => formatJobListItem(j, i)).join("\n\n");

      const keyboard = new InlineKeyboard();
      for (const j of results.slice(0, 10)) {
        const shortId = j.id.slice(0, 8);
        const score = j.suitabilityScore !== null ? `⭐${j.suitabilityScore}` : "";
        const company = j.employer.slice(0, 15);
        const title = j.title.slice(0, 22);
        keyboard.text(`${score} ${title} · ${company}`, `j:d:${shortId}`).row();
      }
      keyboard.text("◀️ Menu", "m:menu");

      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    } catch (err) {
      logger.error("Search command error", {
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply("❌ Search failed. Try again.");
    }
  });

  bot = botInstance;
  return botInstance;
}

export async function sendMainMenu(ctx: Context): Promise<void> {
  // Import here to avoid circular deps
  const { getJobStats } = await import("../../repositories/jobs");
  const { escapeHtml } = await import("./formatting");
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
    .text("📡 Boards", "b:menu")
    .text("⚙️ Settings", "x:menu");

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

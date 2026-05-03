import { logger } from "@infra/logger";
import { Bot, type Context, InlineKeyboard } from "grammy";
import { addAuthorizedChatId, isAuthorized, validateLinkCode } from "./auth";

let bot: Bot | null = null;

export function getBot(): Bot | null {
  return bot;
}

export function createBot(token: string): Bot {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;

  const botInstance = new Bot(token, {
    client: proxyUrl
      ? {
          baseFetchConfig: {
            // Grammy uses fetch internally. For proxy, we rely on
            // the global-agent or undici proxy env vars that Node respects.
            // The HTTPS_PROXY env is already set in Docker.
          },
        }
      : undefined,
  });

  // Error handler
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

    // Allow /start and /link without auth
    const text = ctx.message?.text || "";
    if (text.startsWith("/start") || text.startsWith("/link")) {
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
    const code = ctx.match?.trim();
    if (!code) {
      await ctx.reply("Usage: /link <code>\nGet the code from Job Ops Settings.");
      return;
    }

    if (validateLinkCode(code)) {
      await addAuthorizedChatId(ctx.chat.id);
      await ctx.reply("✅ Linked successfully! You can now use the bot.");
      await sendMainMenu(ctx);
    } else {
      await ctx.reply("❌ Invalid or expired code. Get a new one from Settings.");
    }
  });

  // /menu command
  botInstance.command("menu", async (ctx) => {
    await sendMainMenu(ctx);
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
    .text("⚙️ Settings", "x:menu");

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

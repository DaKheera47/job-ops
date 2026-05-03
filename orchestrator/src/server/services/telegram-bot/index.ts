import { logger } from "@infra/logger";
import * as settingsRepo from "../../repositories/settings";
import { generateLinkCode } from "./auth";
import { createBot, getBot } from "./bot";
import { registerApplyHandlers } from "./handlers/apply";
import { registerJobHandlers } from "./handlers/jobs";
import { registerPipelineHandlers } from "./handlers/pipeline";
import { registerSettingsHandlers } from "./handlers/settings";
import { registerStatsHandlers } from "./handlers/stats";
import {
  startNotificationSubscriptions,
  stopNotificationSubscriptions,
} from "./notifications";

export { generateLinkCode } from "./auth";

let started = false;

export async function initializeTelegramBot(): Promise<void> {
  const token =
    (await settingsRepo.getSetting("telegramBotToken"))?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    logger.info("Telegram bot disabled (no TELEGRAM_BOT_TOKEN)");
    return;
  }

  try {
    const bot = createBot(token);

    // Register all handlers
    registerPipelineHandlers(bot);
    registerJobHandlers(bot);
    registerApplyHandlers(bot);
    registerStatsHandlers(bot);
    registerSettingsHandlers(bot);

    // Start long-polling
    bot.start({
      onStart: () => {
        logger.info("Telegram bot started (long-polling)");
        started = true;
      },
      drop_pending_updates: true,
    });

    // Start proactive notifications
    startNotificationSubscriptions();
  } catch (error) {
    logger.error("Failed to start Telegram bot", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function stopTelegramBot(): Promise<void> {
  const bot = getBot();
  if (bot && started) {
    stopNotificationSubscriptions();
    await bot.stop();
    started = false;
    logger.info("Telegram bot stopped");
  }
}

export function isTelegramBotRunning(): boolean {
  return started;
}

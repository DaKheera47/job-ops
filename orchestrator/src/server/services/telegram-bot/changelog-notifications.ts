/**
 * Changelog notification service.
 *
 * On bot startup, checks if there are unseen changelog entries
 * and sends a pinned message to all authorized chats.
 */

import { logger } from "@infra/logger";
import * as settingsRepo from "../../repositories/settings";
import { getAuthorizedChatIds } from "./auth";
import { getBot } from "./bot";
import {
  formatChangelogMessage,
  getChangelogSince,
  getLatestChangelogVersion,
} from "./changelog";

const SETTING_KEY = "telegramChangelogLastSentVersion";

async function getLastSentVersion(): Promise<string | null> {
  return (await settingsRepo.getSetting(SETTING_KEY)) ?? null;
}

async function setLastSentVersion(version: string): Promise<void> {
  await settingsRepo.setSetting(SETTING_KEY, version);
}

/**
 * Send unseen changelog entries to all authorized chats and pin them.
 * Called on bot startup and after a new user links.
 */
export async function sendChangelogIfNeeded(): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  const lastSent = await getLastSentVersion();
  const entries = getChangelogSince(lastSent);

  if (entries.length === 0) return;

  const message = formatChangelogMessage(entries);
  if (!message) return;

  const chatIds = await getAuthorizedChatIds();
  if (chatIds.size === 0) return;

  let successCount = 0;
  let failureCount = 0;

  for (const chatId of chatIds) {
    try {
      const sent = await bot.api.sendMessage(chatId, message, {
        parse_mode: "HTML",
      });

      // Pin the message for easy access
      try {
        await bot.api.pinChatMessage(chatId, sent.message_id, {
          disable_notification: true,
        });
      } catch (pinErr) {
        // Pinning may fail if bot lacks admin rights — that's OK
        logger.debug("Could not pin changelog message", {
          chatId,
          error:
            pinErr instanceof Error ? pinErr.message : String(pinErr),
        });
      }

      successCount += 1;
    } catch (err) {
      failureCount += 1;
      logger.warn("Failed to send changelog notification", {
        chatId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Only advance the cursor when every authorized chat got the message.
  // Otherwise failed chats would silently miss this changelog forever.
  if (failureCount === 0 && successCount > 0) {
    await setLastSentVersion(getLatestChangelogVersion());
    logger.info("Changelog notification sent", {
      version: getLatestChangelogVersion(),
      chatCount: chatIds.size,
    });
  } else if (failureCount > 0) {
    logger.warn("Changelog cursor not advanced — will retry next startup", {
      version: getLatestChangelogVersion(),
      successCount,
      failureCount,
    });
  }
}

/**
 * Send the full changelog to a specific chat (for /changelog command
 * or when a new user links).
 */
export async function sendFullChangelog(chatId: number): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  const entries = getChangelogSince(null);
  if (entries.length === 0) {
    await bot.api.sendMessage(chatId, "No changelog entries yet.", {
      parse_mode: "HTML",
    });
    return;
  }

  const message = formatChangelogMessage(entries);
  await bot.api.sendMessage(chatId, message, { parse_mode: "HTML" });
}

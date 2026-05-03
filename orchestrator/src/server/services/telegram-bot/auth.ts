import { randomBytes } from "node:crypto";
import { logger } from "@infra/logger";
import * as settingsRepo from "../../repositories/settings";

interface LinkCode {
  code: string;
  expiresAt: number;
}

let activeLinkCode: LinkCode | null = null;

export function generateLinkCode(): string {
  const code = randomBytes(4).toString("hex");
  activeLinkCode = { code, expiresAt: Date.now() + 5 * 60 * 1000 };
  logger.info("Telegram link code generated", { code });
  return code;
}

export function validateLinkCode(code: string): boolean {
  if (!activeLinkCode) return false;
  if (Date.now() > activeLinkCode.expiresAt) {
    activeLinkCode = null;
    return false;
  }
  if (activeLinkCode.code !== code.trim()) return false;
  activeLinkCode = null;
  return true;
}

export async function getAuthorizedChatIds(): Promise<Set<number>> {
  const raw = await settingsRepo.getSetting("telegramAuthorizedChatIds");
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n)),
  );
}

export async function addAuthorizedChatId(chatId: number): Promise<void> {
  const existing = await getAuthorizedChatIds();
  existing.add(chatId);
  await settingsRepo.setSetting(
    "telegramAuthorizedChatIds",
    Array.from(existing).join(","),
  );
  logger.info("Telegram chat ID authorized", { chatId });
}

export async function isAuthorized(chatId: number): Promise<boolean> {
  const authorized = await getAuthorizedChatIds();
  return authorized.has(chatId);
}

export async function areNotificationsEnabled(): Promise<boolean> {
  const raw = await settingsRepo.getSetting("telegramNotificationsEnabled");
  return raw !== "0" && raw !== "false";
}

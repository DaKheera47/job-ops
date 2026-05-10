import { randomBytes, timingSafeEqual } from "node:crypto";
import { logger } from "@infra/logger";
import * as settingsRepo from "../../repositories/settings";

const CODE_TTL_MS = 5 * 60 * 1000;
const CODE_BYTES = 6; // 12 hex chars = 48 bits of entropy
const MAX_ACTIVE_CODES = 16;

const activeLinkCodes = new Map<string, number>();

function purgeExpired(now: number): void {
  for (const [code, expiresAt] of activeLinkCodes) {
    if (expiresAt <= now) activeLinkCodes.delete(code);
  }
}

export function generateLinkCode(): string {
  const now = Date.now();
  purgeExpired(now);
  if (activeLinkCodes.size >= MAX_ACTIVE_CODES) {
    // Drop the oldest to bound memory; iteration order is insertion order.
    const oldest = activeLinkCodes.keys().next().value;
    if (oldest !== undefined) activeLinkCodes.delete(oldest);
  }
  const code = randomBytes(CODE_BYTES).toString("hex");
  activeLinkCodes.set(code, now + CODE_TTL_MS);
  logger.info("Telegram link code generated", { codeLength: code.length });
  return code;
}

export function validateLinkCode(input: string): boolean {
  const candidate = input.trim();
  if (!candidate) return false;
  const now = Date.now();
  purgeExpired(now);

  const candidateBuf = Buffer.from(candidate);
  for (const [code, expiresAt] of activeLinkCodes) {
    const codeBuf = Buffer.from(code);
    if (codeBuf.length !== candidateBuf.length) continue;
    if (!timingSafeEqual(codeBuf, candidateBuf)) continue;
    if (expiresAt <= now) {
      activeLinkCodes.delete(code);
      return false;
    }
    activeLinkCodes.delete(code);
    return true;
  }
  return false;
}

// Per-chat brute-force protection for /link attempts.
const LINK_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_LINK_ATTEMPTS = 5;

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const linkAttempts = new Map<number, AttemptRecord>();

export function registerLinkAttempt(chatId: number): {
  allowed: boolean;
  retryInSeconds?: number;
} {
  const now = Date.now();
  const record = linkAttempts.get(chatId);
  if (!record || record.resetAt <= now) {
    linkAttempts.set(chatId, {
      count: 1,
      resetAt: now + LINK_ATTEMPT_WINDOW_MS,
    });
    return { allowed: true };
  }
  if (record.count >= MAX_LINK_ATTEMPTS) {
    return {
      allowed: false,
      retryInSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }
  record.count += 1;
  return { allowed: true };
}

export function clearLinkAttempts(chatId: number): void {
  linkAttempts.delete(chatId);
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

/**
 * Settings repository - key/value storage for runtime configuration.
 *
 * Secret-kind settings (API keys, passwords) are encrypted at rest using
 * AES-256-GCM when ENCRYPTION_KEY is configured.  Legacy plaintext values
 * are transparently handled on read so migration is non-breaking.
 */

import { logger } from "@infra/logger";
import type { settingsRegistry } from "@shared/settings-registry";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index";
import { decrypt, encrypt } from "../lib/encryption";

const { settings } = schema;

export type SettingKey = Exclude<
  {
    [K in keyof typeof settingsRegistry]: (typeof settingsRegistry)[K]["kind"] extends "virtual"
      ? never
      : K;
  }[keyof typeof settingsRegistry],
  undefined
>;

/* ------------------------------------------------------------------ */
/*  Encryption helpers                                                */
/* ------------------------------------------------------------------ */

/** Keys whose values must be encrypted at rest. */
const SECRET_KEYS: ReadonlySet<string> = new Set([
  "llmApiKey",
  "rxresumePassword",
  "rxresumeApiKey",
  "ukvisajobsPassword",
  "adzunaAppKey",
  "basicAuthPassword",
  "webhookSecret",
]);

function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key);
}

/**
 * Returns the hex-encoded 256-bit encryption key, or `null` when the env
 * var is absent (plaintext fallback mode).
 */
function getEncryptionKey(): string | null {
  const key = process.env.ENCRYPTION_KEY ?? null;
  if (!key) {
    logger.warn(
      "ENCRYPTION_KEY is not set — secret settings will be stored in plaintext",
    );
  }
  return key;
}

/** Heuristic: encrypted values always look like "hex:hex:hex". */
function looksEncrypted(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  return parts.every((p) => /^[0-9a-f]+$/i.test(p));
}

/**
 * Encrypt `value` if the key is a secret and ENCRYPTION_KEY is available.
 * Returns the value unchanged otherwise.
 */
function maybeEncrypt(key: string, value: string): string {
  if (!isSecretKey(key)) return value;
  const encKey = getEncryptionKey();
  if (!encKey) return value;
  return encrypt(value, encKey);
}

/**
 * Decrypt `value` if the key is a secret and the value looks encrypted.
 * Gracefully returns the raw value when ENCRYPTION_KEY is missing or the
 * stored data is legacy plaintext.
 */
function maybeDecrypt(key: string, value: string): string {
  if (!isSecretKey(key)) return value;
  if (!looksEncrypted(value)) return value; // legacy plaintext
  const encKey = getEncryptionKey();
  if (!encKey) return value; // can't decrypt without key
  try {
    return decrypt(value, encKey);
  } catch {
    // If decryption fails (wrong key, corrupted data) return as-is so the
    // caller can surface the issue rather than crash.
    logger.warn("Failed to decrypt setting — returning raw value", { key });
    return value;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export async function getSetting(key: SettingKey): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  if (!row?.value) return row?.value ?? null;
  return maybeDecrypt(key, row.value);
}

export async function getAllSettings(): Promise<
  Partial<Record<SettingKey, string>>
> {
  const rows = await db.select().from(settings);
  return rows.reduce(
    (acc, row) => {
      acc[row.key as SettingKey] = maybeDecrypt(row.key, row.value);
      return acc;
    },
    {} as Partial<Record<SettingKey, string>>,
  );
}

export async function setSetting(
  key: SettingKey,
  value: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  if (value === null) {
    await db.delete(settings).where(eq(settings.key, key));
    return;
  }

  const stored = maybeEncrypt(key, value);

  const [existing] = await db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, key));

  if (existing) {
    await db
      .update(settings)
      .set({ value: stored, updatedAt: now })
      .where(eq(settings.key, key));
    return;
  }

  await db.insert(settings).values({
    key,
    value: stored,
    createdAt: now,
    updatedAt: now,
  });
}

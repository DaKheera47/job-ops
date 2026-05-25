import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ENC_PREFIX = "enc:v1:";

function resolveKey(envVar: string): Buffer {
  const raw = process.env[envVar];
  if (!raw) {
    throw new Error(
      `${envVar} is not set. A 64-character hex string (32 bytes) is required to encrypt IMAP credentials. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error(
      `${envVar} must be a 64-character hex string (32 bytes). Got ${raw.length} characters.`,
    );
  }
  return key;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a prefixed, hex-encoded string: `enc:v1:<iv>:<tag>:<ciphertext>`.
 * Reads the encryption key from the `IMAP_CREDENTIALS_ENCRYPTION_KEY` env var.
 */
export function encryptCredential(plaintext: string): string {
  const key = resolveKey("IMAP_CREDENTIALS_ENCRYPTION_KEY");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_LENGTH) {
    throw new Error("Unexpected auth tag length from AES-256-GCM.");
  }
  return `${ENC_PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a value produced by `encryptCredential`.
 * If the value does not start with the `enc:v1:` prefix it is returned as-is
 * (backward-compatibility for values stored before encryption was enabled).
 * Reads the encryption key from the `IMAP_CREDENTIALS_ENCRYPTION_KEY` env var.
 */
export function decryptCredential(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) {
    return value;
  }

  const key = resolveKey("IMAP_CREDENTIALS_ENCRYPTION_KEY");
  const rest = value.slice(ENC_PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted credential format: expected enc:v1:<iv>:<tag>:<ciphertext>.",
    );
  }

  const [ivHex, tagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(encHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Returns `true` if the given value was produced by `encryptCredential`.
 */
export function isEncryptedCredential(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

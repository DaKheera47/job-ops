import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<{
  passwordHash: string;
  passwordSalt: string;
}> {
  const passwordSalt = randomBytes(16).toString("base64url");
  const derived = (await scryptAsync(
    password,
    passwordSalt,
    KEY_LENGTH,
  )) as Buffer;
  return {
    passwordHash: derived.toString("base64url"),
    passwordSalt,
  };
}

export async function verifyPassword(input: {
  password: string;
  passwordHash: string | null;
  passwordSalt: string | null;
}): Promise<boolean> {
  // SSO-provisioned accounts have no local password, and an empty hash would
  // otherwise compare equal to an empty derived key.
  if (!input.passwordHash || !input.passwordSalt) return false;

  const expected = Buffer.from(input.passwordHash, "base64url");
  const actual = (await scryptAsync(
    input.password,
    input.passwordSalt,
    expected.length,
  )) as Buffer;

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

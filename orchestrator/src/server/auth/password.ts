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
  passwordHash: string;
  passwordSalt: string;
}): Promise<boolean> {
  const expected = Buffer.from(input.passwordHash, "base64url");
  const actual = (await scryptAsync(
    input.password,
    input.passwordSalt,
    expected.length,
  )) as Buffer;

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetBlacklistForTests,
  blacklistToken,
  isBlacklisted,
  signToken,
  verifyToken,
} from "./jwt";

const originalEnv = { ...process.env };

describe("JWT utilities", () => {
  beforeEach(() => {
    process.env.BASIC_AUTH_USER = "admin";
    process.env.BASIC_AUTH_PASSWORD = "secret";
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRY_SECONDS;
    __resetBlacklistForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    __resetBlacklistForTests();
  });

  it("signs and verifies a token", () => {
    const { token, expiresIn } = signToken("admin");
    expect(token).toBeTruthy();
    expect(expiresIn).toBe(86400);

    const payload = verifyToken(token);
    expect(payload.sub).toBe("admin");
    expect(payload.jti).toBeTruthy();
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a tampered token", () => {
    const { token } = signToken("admin");
    const tampered = `${token}x`;
    expect(() => verifyToken(tampered)).toThrow();
  });

  it("rejects a blacklisted token", () => {
    const { token } = signToken("admin");
    const payload = verifyToken(token);
    blacklistToken(payload.jti, payload.exp);

    expect(() => verifyToken(token)).toThrow("Token has been revoked");
  });

  it("isBlacklisted returns correct state", () => {
    const { token } = signToken("admin");
    const payload = verifyToken(token);

    expect(isBlacklisted(payload.jti)).toBe(false);
    blacklistToken(payload.jti, payload.exp);
    expect(isBlacklisted(payload.jti)).toBe(true);
  });

  it("uses explicit JWT_SECRET when provided", () => {
    process.env.JWT_SECRET = "a-very-long-secret-that-is-at-least-32-chars!";
    const { token } = signToken("admin");
    const payload = verifyToken(token);
    expect(payload.sub).toBe("admin");
  });

  it("respects JWT_EXPIRY_SECONDS", () => {
    process.env.JWT_EXPIRY_SECONDS = "60";
    const { expiresIn } = signToken("admin");
    expect(expiresIn).toBe(60);
  });

  it("throws when no secret source is available", () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;
    delete process.env.JWT_SECRET;
    expect(() => signToken("admin")).toThrow(
      "JWT_SECRET or BASIC_AUTH_USER/BASIC_AUTH_PASSWORD must be set",
    );
  });
});

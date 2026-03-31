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

  it("signs and verifies a token", async () => {
    const { token, expiresIn } = await signToken("admin");
    expect(token).toBeTruthy();
    expect(expiresIn).toBe(86400);

    const payload = await verifyToken(token);
    expect(payload.sub).toBe("admin");
    expect(payload.jti).toBeTruthy();
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a tampered token", async () => {
    const { token } = await signToken("admin");
    const tampered = `${token}x`;
    await expect(verifyToken(tampered)).rejects.toThrow();
  });

  it("rejects a blacklisted token", async () => {
    const { token } = await signToken("admin");
    const payload = await verifyToken(token);
    blacklistToken(payload.jti, payload.exp);

    await expect(verifyToken(token)).rejects.toThrow("Token has been revoked");
  });

  it("isBlacklisted returns correct state", async () => {
    const { token } = await signToken("admin");
    const payload = await verifyToken(token);

    expect(isBlacklisted(payload.jti)).toBe(false);
    blacklistToken(payload.jti, payload.exp);
    expect(isBlacklisted(payload.jti)).toBe(true);
  });

  it("uses explicit JWT_SECRET when provided", async () => {
    process.env.JWT_SECRET = "a-very-long-secret-that-is-at-least-32-chars!";
    const { token } = await signToken("admin");
    const payload = await verifyToken(token);
    expect(payload.sub).toBe("admin");
  });

  it("respects JWT_EXPIRY_SECONDS", async () => {
    process.env.JWT_EXPIRY_SECONDS = "60";
    const { expiresIn } = await signToken("admin");
    expect(expiresIn).toBe(60);
  });

  it("throws when no secret source is available", async () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;
    delete process.env.JWT_SECRET;
    await expect(signToken("admin")).rejects.toThrow(
      "JWT_SECRET or BASIC_AUTH_USER/BASIC_AUTH_PASSWORD must be set",
    );
  });
});

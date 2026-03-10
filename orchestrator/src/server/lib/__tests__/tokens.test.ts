import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  issueAccessToken,
  issueRefreshToken,
  issueReauthToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyReauthToken,
} from "../tokens";

const SECRET = "test-secret-that-is-at-least-32-chars-long!!";
const ADMIN_ID = "test-admin-id-123";

describe("tokens", () => {
  describe("access tokens", () => {
    it("issues and verifies an access token", () => {
      const token = issueAccessToken(ADMIN_ID, SECRET);
      const payload = verifyAccessToken(token, SECRET);
      expect(payload.sub).toBe(ADMIN_ID);
      expect(payload.type).toBe("access");
    });

    it("rejects expired tokens", () => {
      vi.useFakeTimers();
      const token = issueAccessToken(ADMIN_ID, SECRET);
      vi.advanceTimersByTime(16 * 60 * 1000); // 16 minutes
      expect(() => verifyAccessToken(token, SECRET)).toThrow();
      vi.useRealTimers();
    });

    it("rejects tokens signed with wrong secret", () => {
      const token = issueAccessToken(ADMIN_ID, SECRET);
      expect(() => verifyAccessToken(token, "wrong-secret")).toThrow();
    });
  });

  describe("refresh tokens", () => {
    it("issues and verifies a refresh token", () => {
      const { token, jti } = issueRefreshToken(ADMIN_ID, SECRET);
      expect(jti).toBeTruthy();
      const payload = verifyRefreshToken(token, SECRET);
      expect(payload.sub).toBe(ADMIN_ID);
      expect(payload.type).toBe("refresh");
      expect(payload.jti).toBe(jti);
    });
  });

  describe("reauth tokens", () => {
    it("issues and verifies a reauth token", () => {
      const token = issueReauthToken(ADMIN_ID, SECRET);
      const payload = verifyReauthToken(token, SECRET);
      expect(payload.sub).toBe(ADMIN_ID);
      expect(payload.type).toBe("reauth");
    });

    it("expires after 5 minutes", () => {
      vi.useFakeTimers();
      const token = issueReauthToken(ADMIN_ID, SECRET);
      vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes
      expect(() => verifyReauthToken(token, SECRET)).toThrow();
      vi.useRealTimers();
    });
  });

  describe("secret rotation", () => {
    it("verifyAccessToken falls back to previous secret", () => {
      const oldSecret = "old-secret-that-is-at-least-32-chars-long!!";
      const token = issueAccessToken(ADMIN_ID, oldSecret);
      const payload = verifyAccessToken(token, SECRET, oldSecret);
      expect(payload.sub).toBe(ADMIN_ID);
    });
  });
});

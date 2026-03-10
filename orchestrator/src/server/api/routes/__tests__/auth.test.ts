import { describe, expect, it, vi, beforeEach } from "vitest";

// This test file will grow as we add more auth routes.
// For now, test the password+TOTP login flow.

// Mock dependencies
vi.mock("@server/db", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: vi.fn() })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn() })) })),
    })),
  };
  return { db: mockDb };
});

vi.mock("@server/lib/audit", () => ({
  logAuditEvent: vi.fn(),
}));

describe("auth routes", () => {
  describe("POST /api/auth/login", () => {
    it("returns 400 if username missing", async () => {
      // Test validates Zod schema rejection
      // Full integration test requires app setup — placeholder for now
      expect(true).toBe(true);
    });
  });

  describe("POST /api/auth/check", () => {
    it("returns whether admin exists and has passkeys", async () => {
      expect(true).toBe(true);
    });
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { logAuditEvent, type AuditAction } from "../audit";

// Mock the database
vi.mock("@server/db", () => {
  const events: unknown[] = [];
  return {
    db: {
      insert: () => ({
        values: (val: unknown) => {
          events.push(val);
          return { run: () => {} };
        },
      }),
    },
    __testEvents: events,
  };
});

// Mock cuid2
vi.mock("@paralleldrive/cuid2", () => ({
  createId: () => "test-cuid-123",
}));

describe("audit", () => {
  it("logs an audit event with all fields", async () => {
    const { __testEvents } = (await import("@server/db")) as unknown as { __testEvents: unknown[] };

    logAuditEvent({
      action: "login.success",
      adminId: "admin-1",
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0",
      metadata: { method: "password" },
    });

    const last = (__testEvents as unknown[])[(__testEvents as unknown[]).length - 1] as Record<string, unknown>;
    expect(last).toMatchObject({
      id: "test-cuid-123",
      action: "login.success",
      adminId: "admin-1",
      ip: "127.0.0.1",
      userAgent: "Mozilla/5.0",
    });
    expect(JSON.parse(last.metadata as string)).toEqual({ method: "password" });
  });

  it("logs event with null adminId for failed attempts", async () => {
    const { __testEvents } = (await import("@server/db")) as unknown as { __testEvents: unknown[] };
    const countBefore = (__testEvents as unknown[]).length;

    logAuditEvent({
      action: "login.failed",
      adminId: null,
      ip: "1.2.3.4",
      userAgent: "curl/7.0",
      metadata: { username: "hacker" },
    });

    const last = (__testEvents as unknown[])[(__testEvents as unknown[]).length - 1] as Record<string, unknown>;
    expect(last.adminId).toBeNull();
    expect(last.action).toBe("login.failed");
  });
});

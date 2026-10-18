import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("settings ownership", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-settings-scope-"));
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      JOBOPS_APP_MODE: "local",
    };
    await import("@server/db/migrate");
    const { db, schema, closeDb: close } = await import("@server/db");
    closeDb = close;
    for (const userId of ["alice", "bob"]) {
      await db.insert(schema.users).values({
        id: userId,
        username: userId,
        passwordHash: "hash",
        passwordSalt: "salt",
      });
      await db.insert(schema.tenantMemberships).values({
        id: `membership-${userId}`,
        tenantId: "tenant_default",
        userId,
        role: userId === "alice" ? "owner" : "member",
      });
    }
  });

  afterEach(async () => {
    closeDb?.();
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  async function asUser<T>(userId: string, work: () => Promise<T>): Promise<T> {
    const { runWithRequestContext } = await import("@infra/request-context");
    return runWithRequestContext({ tenantId: "tenant_default", userId }, work);
  }

  it("keeps personal settings separate for users of the same local tenant", async () => {
    const { getSetting, setSetting } = await import("./settings");
    await asUser("alice", () => setSetting("model", "model-alice"));
    await asUser("bob", () => setSetting("model", "model-bob"));

    expect(await asUser("alice", () => getSetting("model"))).toBe(
      "model-alice",
    );
    expect(await asUser("bob", () => getSetting("model"))).toBe("model-bob");
  });

  it("uses one platform backup value across users", async () => {
    const { getSetting, setSetting } = await import("./settings");
    await asUser("alice", () => setSetting("backupHour", "7"));
    expect(await asUser("bob", () => getSetting("backupHour"))).toBe("7");
    await asUser("bob", () => setSetting("backupHour", "9"));
    expect(await asUser("alice", () => getSetting("backupHour"))).toBe("9");
  });
});

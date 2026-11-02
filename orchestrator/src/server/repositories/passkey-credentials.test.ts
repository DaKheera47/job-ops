import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const USER_A = "user-a";
const USER_B = "user-b";

describe.sequential("passkey-credentials repository", () => {
  const originalEnv = { ...process.env };
  let tempDir = "";
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-passkey-repo-test-"));
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
    };

    await import("../db/migrate");
    const dbModule = await import("../db");
    closeDb = dbModule.closeDb;

    await dbModule.db.insert(dbModule.schema.tenants).values([
      { id: TENANT_A, name: "Workspace A", slug: "workspace-a" },
      { id: TENANT_B, name: "Workspace B", slug: "workspace-b" },
    ]);
    await dbModule.db.insert(dbModule.schema.users).values([
      {
        id: USER_A,
        username: "ada",
        passwordHash: "hash-a",
        passwordSalt: "salt-a",
      },
      {
        id: USER_B,
        username: "grace",
        passwordHash: "hash-b",
        passwordSalt: "salt-b",
      },
    ]);
  });

  afterEach(async () => {
    closeDb?.();
    closeDb = null;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
    process.env = { ...originalEnv };
  });

  async function createPasskeyFor(
    repo: typeof import("./passkey-credentials"),
    overrides: {
      id: string;
      tenantId?: string;
      userId?: string;
      name?: string;
    },
  ) {
    return repo.createPasskey({
      tenantId: TENANT_A,
      userId: USER_A,
      name: "Laptop",
      publicKey: "cHVibGljLWtleQ",
      counter: 0,
      transports: ["internal", "hybrid"],
      deviceType: "multiDevice",
      backedUp: true,
      aaguid: "00000000-0000-0000-0000-000000000000",
      ...overrides,
    });
  }

  it("lists a user's own passkeys in creation order", async () => {
    const repo = await import("./passkey-credentials");

    const first = await createPasskeyFor(repo, { id: "cred-1" });
    const second = await createPasskeyFor(repo, {
      id: "cred-2",
      name: "Phone",
    });
    await createPasskeyFor(repo, {
      id: "cred-3",
      tenantId: TENANT_B,
      userId: USER_B,
    });

    expect(first).toEqual({
      id: "cred-1",
      name: "Laptop",
      deviceType: "multiDevice",
      backedUp: true,
      transports: ["internal", "hybrid"],
      createdAt: expect.any(String),
      lastUsedAt: null,
    });
    expect(await repo.listPasskeysForUser(USER_A)).toEqual([first, second]);
    expect(await repo.countPasskeysForUser(USER_A)).toBe(2);
    expect(await repo.countPasskeysForUser(USER_B)).toBe(1);
  });

  it("resolves a credential by id without user context", async () => {
    const repo = await import("./passkey-credentials");
    await createPasskeyFor(repo, {
      id: "cred-b",
      tenantId: TENANT_B,
      userId: USER_B,
      name: "Security key",
    });

    expect(await repo.getPasskeyById("cred-b")).toMatchObject({
      id: "cred-b",
      tenantId: TENANT_B,
      userId: USER_B,
      publicKey: "cHVibGljLWtleQ",
      counter: 0,
      transports: ["internal", "hybrid"],
      lastUsedAt: null,
    });
    expect(await repo.getPasskeyById("missing")).toBeNull();
  });

  it("records the signature counter, last use and reported backup state", async () => {
    const repo = await import("./passkey-credentials");
    await createPasskeyFor(repo, { id: "cred-1" });

    await repo.recordPasskeyAuthentication({
      id: "cred-1",
      counter: 42,
      lastUsedAt: 1_760_000_000,
      deviceType: "singleDevice",
      backedUp: false,
    });

    expect(await repo.getPasskeyById("cred-1")).toMatchObject({
      counter: 42,
      lastUsedAt: 1_760_000_000,
      deviceType: "singleDevice",
      backedUp: false,
    });
  });

  it("renames only the caller's own passkey", async () => {
    const repo = await import("./passkey-credentials");
    await createPasskeyFor(repo, { id: "cred-1" });

    expect(
      await repo.renamePasskey({
        id: "cred-1",
        userId: USER_B,
        name: "Stolen",
      }),
    ).toBeNull();
    expect(
      await repo.renamePasskey({
        id: "cred-1",
        userId: USER_A,
        name: "Work laptop",
      }),
    ).toMatchObject({ id: "cred-1", name: "Work laptop" });
    expect(await repo.getPasskeyById("cred-1")).toMatchObject({
      name: "Work laptop",
    });
  });

  it("deletes only the caller's own passkey", async () => {
    const repo = await import("./passkey-credentials");
    await createPasskeyFor(repo, { id: "cred-1" });

    expect(await repo.deletePasskey({ id: "cred-1", userId: USER_B })).toBe(
      false,
    );
    expect(await repo.getPasskeyById("cred-1")).not.toBeNull();

    expect(await repo.deletePasskey({ id: "cred-1", userId: USER_A })).toBe(
      true,
    );
    expect(await repo.getPasskeyById("cred-1")).toBeNull();
    expect(await repo.deletePasskey({ id: "cred-1", userId: USER_A })).toBe(
      false,
    );
  });

  it("stores passkeys without transports or attestation metadata", async () => {
    const repo = await import("./passkey-credentials");

    const summary = await repo.createPasskey({
      id: "cred-minimal",
      tenantId: TENANT_A,
      userId: USER_A,
      name: "Passkey 1",
      publicKey: "cHVibGljLWtleQ",
      counter: 0,
      transports: null,
      deviceType: null,
      backedUp: false,
      aaguid: null,
    });

    expect(summary).toMatchObject({
      transports: null,
      deviceType: null,
      backedUp: false,
    });
    expect(await repo.getPasskeyById("cred-minimal")).toMatchObject({
      aaguid: null,
    });
  });
});

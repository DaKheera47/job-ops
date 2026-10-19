import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("sso identities repository", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-sso-identities-"));
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
    };
    await import("@server/db/migrate");
    ({ closeDb } = await import("@server/db"));
  });

  afterEach(async () => {
    closeDb?.();
    closeDb = null;
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createUser(username: string) {
    const usersRepo = await import("./users");
    const user = await usersRepo.createSsoProvisionedUser({
      mode: "local",
      username,
    });
    if (!user) throw new Error("Failed to create test user");
    return user;
  }

  it("resolves an identity without any tenant or user scope", async () => {
    const repo = await import("./sso-identities");
    const user = await createUser("alice");

    const created = await repo.createSsoIdentity({
      tenantId: user.workspaceId,
      userId: user.id,
      provider: "oidc",
      issuer: "https://id.example.com",
      subject: "subject-1",
      email: "alice@example.com",
      displayName: "Alice",
    });

    await expect(
      repo.findSsoIdentity({
        provider: "oidc",
        issuer: "https://id.example.com",
        subject: "subject-1",
      }),
    ).resolves.toMatchObject({
      id: created.id,
      userId: user.id,
      email: "alice@example.com",
    });

    await expect(
      repo.findSsoIdentity({
        provider: "oidc",
        issuer: "https://other.example.com",
        subject: "subject-1",
      }),
    ).resolves.toBeNull();
  });

  it("refuses to bind the same provider subject twice", async () => {
    const repo = await import("./sso-identities");
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    await repo.createSsoIdentity({
      tenantId: alice.workspaceId,
      userId: alice.id,
      provider: "github",
      issuer: "https://github.com",
      subject: "4242",
      email: null,
      displayName: null,
    });

    await expect(
      repo.createSsoIdentity({
        tenantId: bob.workspaceId,
        userId: bob.id,
        provider: "github",
        issuer: "https://github.com",
        subject: "4242",
        email: null,
        displayName: null,
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it("lists and counts identities per user", async () => {
    const repo = await import("./sso-identities");
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    await repo.createSsoIdentity({
      tenantId: alice.workspaceId,
      userId: alice.id,
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "google-1",
      email: "alice@example.com",
      displayName: "Alice",
    });
    await repo.createSsoIdentity({
      tenantId: alice.workspaceId,
      userId: alice.id,
      provider: "github",
      issuer: "https://github.com",
      subject: "github-1",
      email: null,
      displayName: null,
    });
    await repo.createSsoIdentity({
      tenantId: bob.workspaceId,
      userId: bob.id,
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "google-2",
      email: "bob@example.com",
      displayName: "Bob",
    });

    const identities = await repo.listSsoIdentitiesForUser(alice.id);
    expect(identities.map((identity) => identity.provider).sort()).toEqual([
      "github",
      "google",
    ]);
    await expect(repo.countSsoIdentitiesForUser(alice.id)).resolves.toBe(2);
    await expect(repo.countSsoIdentitiesForUser(bob.id)).resolves.toBe(1);
  });

  it("deletes only the requesting user's identity", async () => {
    const repo = await import("./sso-identities");
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    const identity = await repo.createSsoIdentity({
      tenantId: alice.workspaceId,
      userId: alice.id,
      provider: "google",
      issuer: "https://accounts.google.com",
      subject: "google-1",
      email: "alice@example.com",
      displayName: "Alice",
    });

    await expect(
      repo.deleteSsoIdentity({ id: identity.id, userId: bob.id }),
    ).resolves.toBe(false);
    await expect(repo.countSsoIdentitiesForUser(alice.id)).resolves.toBe(1);

    await expect(
      repo.deleteSsoIdentity({ id: identity.id, userId: alice.id }),
    ).resolves.toBe(true);
    await expect(repo.countSsoIdentitiesForUser(alice.id)).resolves.toBe(0);
  });
});

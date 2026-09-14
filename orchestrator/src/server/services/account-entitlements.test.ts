import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("account entitlements", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-entitlements-"));
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
      JOBOPS_APP_MODE: "hosted",
      JOBOPS_HOSTED_TENANT_ID: "tenant_default",
      JOBOPS_HOSTED_PLATFORM_LLM_ENABLED: "true",
      STRIPE_PRO_PRICE_ID: "price_pro",
    };
    await import("@server/db/migrate");
    ({ closeDb } = await import("@server/db"));
    const { db, schema } = await import("@server/db");
    for (const userId of ["alice", "bob"]) {
      await db.insert(schema.users).values({
        id: userId,
        username: userId,
        displayName: userId,
        passwordHash: "hash",
        passwordSalt: "salt",
      });
      await db.insert(schema.tenantMemberships).values({
        id: `membership-${userId}`,
        userId,
        tenantId: "tenant_default",
        role: "member",
      });
    }
  });

  afterEach(async () => {
    closeDb?.();
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  async function withUser<T>(userId: string, work: () => Promise<T>) {
    const { runWithRequestContext } = await import("@infra/request-context");
    return runWithRequestContext(
      { tenantId: "tenant_default", userId, username: userId },
      work,
    );
  }

  it("moves one account Free → Pro → Free without affecting its tenant peer", async () => {
    const { getCurrentAccountEntitlements } = await import(
      "./account-entitlements"
    );
    const { saveSubscriptionState } = await import(
      "@server/repositories/account-subscriptions"
    );

    await expect(
      withUser("alice", getCurrentAccountEntitlements),
    ).resolves.toMatchObject({
      plan: "free",
      platformAiIncluded: false,
      userEditableLlmSettings: true,
      hostedLimits: { job_search: 100 },
    });

    await saveSubscriptionState({
      scope: { tenantId: "tenant_default", userId: "alice" },
      stripeCustomerId: "cus_alice",
      stripeSubscriptionId: "sub_alice",
      stripeSubscriptionCreatedAt: 100,
      stripePriceId: "price_pro",
      stripeStatus: "active",
      currentPeriodEnd: 2_000_000_000,
      cancelAtPeriodEnd: true,
    });

    await expect(
      withUser("alice", getCurrentAccountEntitlements),
    ).resolves.toMatchObject({
      plan: "pro",
      platformAiIncluded: true,
      userEditableLlmSettings: false,
      hostedLimits: { job_search: 500 },
      subscription: { cancelAtPeriodEnd: true },
    });
    await expect(
      withUser("bob", getCurrentAccountEntitlements),
    ).resolves.toMatchObject({ plan: "free" });

    await saveSubscriptionState({
      scope: { tenantId: "tenant_default", userId: "alice" },
      stripeCustomerId: "cus_alice",
      stripeSubscriptionId: "sub_alice",
      stripeSubscriptionCreatedAt: 100,
      stripePriceId: "price_pro",
      stripeStatus: "canceled",
      currentPeriodEnd: 2_000_000_000,
      cancelAtPeriodEnd: false,
    });
    await expect(
      withUser("alice", getCurrentAccountEntitlements),
    ).resolves.toMatchObject({ plan: "free", platformAiIncluded: false });
  });

  it("leaves local behavior unlimited and user-configurable without account context", async () => {
    delete process.env.JOBOPS_APP_MODE;
    delete process.env.JOBOPS_HOSTED_TENANT_ID;
    const { getCurrentAccountEntitlements } = await import(
      "./account-entitlements"
    );

    await expect(getCurrentAccountEntitlements()).resolves.toMatchObject({
      plan: "free",
      platformAiIncluded: false,
      userEditableLlmSettings: true,
      subscription: null,
    });
  });
});

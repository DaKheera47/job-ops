import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("hosted billing service", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-billing-"));
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
      JOBOPS_APP_MODE: "hosted",
      JOBOPS_HOSTED_TENANT_ID: "tenant_default",
      JOBOPS_PUBLIC_BASE_URL: "https://cloud.jobops.example/path",
      STRIPE_SECRET_KEY: "sk_test_jobops",
      STRIPE_WEBHOOK_SECRET: "whsec_jobops",
      STRIPE_PRO_PRICE_ID: "price_pro",
    };
    await import("@server/db/migrate");
    ({ closeDb } = await import("@server/db"));
    const { db, schema } = await import("@server/db");
    await db.insert(schema.users).values({
      id: "alice",
      username: "alice",
      displayName: "Alice",
      passwordHash: "hash",
      passwordSalt: "salt",
    });
    await db.insert(schema.tenantMemberships).values({
      id: "membership-alice",
      userId: "alice",
      tenantId: "tenant_default",
      role: "member",
    });
  });

  afterEach(async () => {
    closeDb?.();
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  async function withAlice<T>(work: () => Promise<T>) {
    const { runWithRequestContext } = await import("@infra/request-context");
    return runWithRequestContext(
      {
        tenantId: "tenant_default",
        userId: "alice",
        username: "alice",
      },
      work,
    );
  }

  function subscription(status: Stripe.Subscription.Status = "active") {
    return {
      id: "sub_alice",
      object: "subscription",
      created: 100,
      customer: "cus_alice",
      status,
      cancel_at_period_end: false,
      metadata: {
        jobops_tenant_id: "tenant_default",
        jobops_user_id: "alice",
      },
      items: {
        data: [
          {
            current_period_end: 2_000_000_000,
            price: { id: "price_pro" },
          },
        ],
      },
    } as unknown as Stripe.Subscription;
  }

  it("creates one server-priced Checkout session tied to tenant and user", async () => {
    const createCustomer = vi.fn().mockResolvedValue({ id: "cus_alice" });
    const createSession = vi
      .fn()
      .mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    const stripe = {
      customers: { create: createCustomer },
      checkout: { sessions: { create: createSession } },
    } as unknown as Stripe;
    const { createCheckoutSession } = await import("./billing");

    await expect(
      withAlice(() => createCheckoutSession(stripe)),
    ).resolves.toEqual({ url: "https://checkout.stripe.test/session" });
    expect(createCustomer).toHaveBeenCalledWith({
      metadata: {
        jobops_tenant_id: "tenant_default",
        jobops_user_id: "alice",
      },
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_alice",
        client_reference_id: "alice",
        line_items: [{ price: "price_pro", quantity: 1 }],
        metadata: {
          jobops_tenant_id: "tenant_default",
          jobops_user_id: "alice",
        },
        success_url: "https://cloud.jobops.example/settings?billing=success",
      }),
    );
  });

  it("does not create a second Checkout subscription while one is open", async () => {
    const { saveSubscriptionState } = await import(
      "@server/repositories/account-subscriptions"
    );
    await saveSubscriptionState({
      scope: { tenantId: "tenant_default", userId: "alice" },
      stripeCustomerId: "cus_alice",
      stripeSubscriptionId: "sub_alice",
      stripeSubscriptionCreatedAt: 100,
      stripePriceId: "price_old",
      stripeStatus: "past_due",
      currentPeriodEnd: 2_000_000_000,
      cancelAtPeriodEnd: false,
    });

    const createSession = vi.fn();
    const stripe = {
      customers: { create: vi.fn() },
      checkout: { sessions: { create: createSession } },
    } as unknown as Stripe;
    const { createCheckoutSession } = await import("./billing");

    await expect(
      withAlice(() => createCheckoutSession(stripe)),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects invalid webhook signatures before handling payloads", async () => {
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error("bad signature");
        }),
      },
    } as unknown as Stripe;
    const { handleStripeWebhook } = await import("./billing");

    await expect(
      handleStripeWebhook(Buffer.from("{}"), "invalid", stripe),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_REQUEST",
      message: "Invalid Stripe webhook signature.",
    });
  });

  it("applies subscription webhooks idempotently and ignores an older replacement", async () => {
    const active = subscription("active");
    const constructEvent = vi.fn();
    const retrieve = vi.fn().mockResolvedValue(active);
    const stripe = {
      webhooks: { constructEvent },
      subscriptions: { retrieve },
    } as unknown as Stripe;
    const { handleStripeWebhook } = await import("./billing");
    const { getCurrentAccountEntitlements } = await import(
      "./account-entitlements"
    );

    constructEvent.mockReturnValue({
      type: "customer.subscription.created",
      data: { object: active },
    });
    await handleStripeWebhook(Buffer.from("{}"), "valid", stripe);
    await handleStripeWebhook(Buffer.from("{}"), "valid", stripe);
    await expect(
      withAlice(getCurrentAccountEntitlements),
    ).resolves.toMatchObject({ plan: "pro" });

    constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { ...active, status: "canceled" } },
    });
    await handleStripeWebhook(Buffer.from("{}"), "valid", stripe);
    await expect(
      withAlice(getCurrentAccountEntitlements),
    ).resolves.toMatchObject({ plan: "free" });

    const older = {
      ...active,
      id: "sub_older",
      created: 50,
      customer: "cus_older",
      status: "active",
    } as Stripe.Subscription;
    retrieve.mockResolvedValue(older);
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: older },
    });
    await handleStripeWebhook(Buffer.from("{}"), "valid", stripe);
    await expect(
      withAlice(getCurrentAccountEntitlements),
    ).resolves.toMatchObject({ plan: "free" });
    const { getAccountSubscription } = await import(
      "@server/repositories/account-subscriptions"
    );
    await expect(
      getAccountSubscription({ tenantId: "tenant_default", userId: "alice" }),
    ).resolves.toMatchObject({
      stripeCustomerId: "cus_alice",
      stripeSubscriptionId: "sub_alice",
      stripeStatus: "canceled",
    });
  });
});

import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";

const { accountSubscriptions } = schema;

export type AccountSubscription = typeof accountSubscriptions.$inferSelect;

export type AccountBillingScope = {
  tenantId: string;
  userId: string;
};

function scopeFilter(scope: AccountBillingScope) {
  return and(
    eq(accountSubscriptions.tenantId, scope.tenantId),
    eq(accountSubscriptions.userId, scope.userId),
  );
}

export async function getAccountSubscription(
  scope: AccountBillingScope,
): Promise<AccountSubscription | null> {
  const [row] = await db
    .select()
    .from(accountSubscriptions)
    .where(scopeFilter(scope))
    .limit(1);
  return row ?? null;
}

export async function getAccountSubscriptionByCustomerId(
  stripeCustomerId: string,
): Promise<AccountSubscription | null> {
  const [row] = await db
    .select()
    .from(accountSubscriptions)
    .where(eq(accountSubscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row ?? null;
}

export async function saveStripeCustomer(
  scope: AccountBillingScope,
  stripeCustomerId: string,
): Promise<AccountSubscription> {
  const now = new Date().toISOString();
  await db
    .insert(accountSubscriptions)
    .values({
      ...scope,
      stripeCustomerId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [accountSubscriptions.tenantId, accountSubscriptions.userId],
      set: { stripeCustomerId, updatedAt: now },
    });

  const row = await getAccountSubscription(scope);
  if (!row) throw new Error("Failed to save Stripe customer");
  return row;
}

export async function saveSubscriptionState(input: {
  scope: AccountBillingScope;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionCreatedAt: number;
  stripePriceId: string | null;
  stripeStatus: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}): Promise<AccountSubscription> {
  const existing = await getAccountSubscription(input.scope);
  if (
    existing?.stripeSubscriptionId &&
    existing.stripeSubscriptionId !== input.stripeSubscriptionId &&
    (existing.stripeSubscriptionCreatedAt ?? 0) >=
      input.stripeSubscriptionCreatedAt
  ) {
    return existing;
  }

  const now = new Date().toISOString();
  await db
    .insert(accountSubscriptions)
    .values({
      ...input.scope,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeSubscriptionCreatedAt: input.stripeSubscriptionCreatedAt,
      stripePriceId: input.stripePriceId,
      stripeStatus: input.stripeStatus,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [accountSubscriptions.tenantId, accountSubscriptions.userId],
      set: {
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripeSubscriptionCreatedAt: input.stripeSubscriptionCreatedAt,
        stripePriceId: input.stripePriceId,
        stripeStatus: input.stripeStatus,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        updatedAt: now,
      },
    });

  const row = await getAccountSubscription(input.scope);
  if (!row) throw new Error("Failed to save Stripe subscription");
  return row;
}

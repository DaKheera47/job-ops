import {
  badRequest,
  conflict,
  notFound,
  serviceUnavailable,
} from "@infra/errors";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import {
  type AccountBillingScope,
  getAccountSubscription,
  getAccountSubscriptionByCustomerId,
  saveStripeCustomer,
  saveSubscriptionState,
} from "@server/repositories/account-subscriptions";
import * as usersRepo from "@server/repositories/users";
import { getPrivateDataScope } from "@server/tenancy/private-scope";
import Stripe from "stripe";

const TENANT_METADATA_KEY = "jobops_tenant_id";
const USER_METADATA_KEY = "jobops_user_id";
const OPEN_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

let stripeClient: Stripe | null = null;
let stripeClientKey: string | null = null;

function requireHostedMode(): void {
  if (getJobOpsAppConfig().appMode !== "hosted") {
    throw notFound("Route not found");
  }
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw serviceUnavailable(`${key} is required for hosted billing.`);
  }
  return value;
}

function getStripe(): Stripe {
  const key = requireEnv("STRIPE_SECRET_KEY");
  if (!stripeClient || stripeClientKey !== key) {
    stripeClient = new Stripe(key);
    stripeClientKey = key;
  }
  return stripeClient;
}

function getPublicBaseUrl(): string {
  const raw = requireEnv("JOBOPS_PUBLIC_BASE_URL");
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw null;
    return url.origin;
  } catch {
    throw serviceUnavailable(
      "JOBOPS_PUBLIC_BASE_URL must be a valid HTTP(S) URL for hosted billing.",
    );
  }
}

function getCurrentScope(): AccountBillingScope {
  const scope = getPrivateDataScope();
  if (!scope.userId) throw badRequest("Hosted billing requires a user");
  return { tenantId: scope.tenantId, userId: scope.userId };
}

function metadataFor(scope: AccountBillingScope): Stripe.MetadataParam {
  return {
    [TENANT_METADATA_KEY]: scope.tenantId,
    [USER_METADATA_KEY]: scope.userId,
  };
}

function idOf(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function subscriptionPeriodEnd(
  subscription: Stripe.Subscription,
): number | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  return ends.length > 0 ? Math.max(...ends) : null;
}

function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  const configuredPrice = process.env.STRIPE_PRO_PRICE_ID?.trim();
  return (
    subscription.items.data.find((item) => item.price.id === configuredPrice)
      ?.price.id ??
    subscription.items.data[0]?.price.id ??
    null
  );
}

async function scopeFromStripeObject(
  customerId: string,
  metadata: Stripe.Metadata | null,
): Promise<AccountBillingScope | null> {
  const appConfig = getJobOpsAppConfig();
  const existing = await getAccountSubscriptionByCustomerId(customerId);
  if (existing) {
    if (
      appConfig.appMode === "hosted" &&
      existing.tenantId !== appConfig.hostedTenantId
    ) {
      return null;
    }
    return { tenantId: existing.tenantId, userId: existing.userId };
  }

  const tenantId = metadata?.[TENANT_METADATA_KEY]?.trim();
  const userId = metadata?.[USER_METADATA_KEY]?.trim();
  if (!tenantId || !userId) return null;
  if (appConfig.appMode === "hosted" && tenantId !== appConfig.hostedTenantId) {
    return null;
  }
  const user = await usersRepo.getUserById(userId);
  if (!user || user.workspaceId !== tenantId) return null;
  const scope = { tenantId, userId };
  if (!(await getAccountSubscription(scope))) {
    await saveStripeCustomer(scope, customerId);
  }
  return scope;
}

async function persistSubscription(subscription: Stripe.Subscription) {
  const customerId = idOf(subscription.customer);
  if (!customerId) return null;
  const scope = await scopeFromStripeObject(customerId, subscription.metadata);
  if (!scope) return null;

  return saveSubscriptionState({
    scope,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionCreatedAt: subscription.created,
    stripePriceId: subscriptionPriceId(subscription),
    stripeStatus: subscription.status,
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

async function retrieveCurrentSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<Stripe.Subscription> {
  try {
    return await stripe.subscriptions.retrieve(subscription.id);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "resource_missing"
    ) {
      return { ...subscription, status: "canceled" };
    }
    throw error;
  }
}

export async function createCheckoutSession(
  stripe?: Stripe,
): Promise<{ url: string }> {
  requireHostedMode();
  const client = stripe ?? getStripe();
  const scope = getCurrentScope();
  const existing = await getAccountSubscription(scope);
  if (
    existing?.stripeSubscriptionId &&
    existing.stripeStatus &&
    OPEN_SUBSCRIPTION_STATUSES.has(
      existing.stripeStatus as Stripe.Subscription.Status,
    )
  ) {
    throw conflict("This account already has a Stripe subscription.");
  }

  const customerId =
    existing?.stripeCustomerId ??
    (
      await client.customers.create({
        metadata: metadataFor(scope),
      })
    ).id;
  if (!existing) await saveStripeCustomer(scope, customerId);

  const baseUrl = getPublicBaseUrl();
  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: scope.userId,
    line_items: [{ price: requireEnv("STRIPE_PRO_PRICE_ID"), quantity: 1 }],
    metadata: metadataFor(scope),
    subscription_data: { metadata: metadataFor(scope) },
    success_url: `${baseUrl}/settings?billing=success`,
    cancel_url: `${baseUrl}/settings?billing=cancelled`,
  });
  if (!session.url) throw serviceUnavailable("Stripe Checkout is unavailable.");
  return { url: session.url };
}

export async function createPortalSession(
  stripe?: Stripe,
): Promise<{ url: string }> {
  requireHostedMode();
  const client = stripe ?? getStripe();
  const subscription = await getAccountSubscription(getCurrentScope());
  if (!subscription?.stripeCustomerId) {
    throw badRequest("This account does not have a Stripe customer yet.");
  }
  const session = await client.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${getPublicBaseUrl()}/settings`,
  });
  return { url: session.url };
}

export async function handleStripeWebhook(
  payload: Buffer,
  signature: string | undefined,
  stripe?: Stripe,
): Promise<void> {
  requireHostedMode();
  const client = stripe ?? getStripe();
  if (!signature) throw badRequest("Missing Stripe signature.");

  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(
      payload,
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    throw badRequest("Invalid Stripe webhook signature.");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const customerId = idOf(session.customer);
    if (customerId) {
      await scopeFromStripeObject(customerId, session.metadata);
    }
    const subscriptionId = idOf(session.subscription);
    if (subscriptionId) {
      await persistSubscription(
        await client.subscriptions.retrieve(subscriptionId),
      );
    }
    return;
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const incoming = event.data.object;
    await persistSubscription(
      await retrieveCurrentSubscription(client, incoming),
    );
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    await persistSubscription(event.data.object);
  }
}

import { getJobOpsAppConfig } from "@server/config/app-mode";
import { getAccountSubscription } from "@server/repositories/account-subscriptions";
import { getPrivateDataScope } from "@server/tenancy/private-scope";
import type { AccountEntitlements, HostedUsageAction } from "@shared/types";

export const FREE_HOSTED_MONTHLY_LIMITS: Record<HostedUsageAction, number> = {
  job_search: 100,
  pipeline_run: 25,
  tailoring: 250,
  ghostwriter: 250,
  pdf_export: 250,
};

// Product decision: keep these five values together until usage data supports
// making them configurable.
export const PRO_HOSTED_MONTHLY_LIMITS: Record<HostedUsageAction, number> = {
  job_search: 500,
  pipeline_run: 100,
  tailoring: 1_000,
  ghostwriter: 1_000,
  pdf_export: 1_000,
};

const PRO_STATUSES = new Set(["active", "trialing"]);

export async function getCurrentAccountEntitlements(): Promise<AccountEntitlements> {
  const config = getJobOpsAppConfig();
  if (config.appMode !== "hosted") {
    return {
      plan: "free",
      platformAiIncluded: false,
      userEditableLlmSettings: true,
      hostedLimits: FREE_HOSTED_MONTHLY_LIMITS,
      subscription: null,
    };
  }

  const scope = getPrivateDataScope();
  if (!scope.userId) throw new Error("Hosted account scope requires a user");
  const subscription = await getAccountSubscription({
    tenantId: scope.tenantId,
    userId: scope.userId,
  });
  const pro = Boolean(
    subscription?.stripePriceId &&
      subscription.stripePriceId === process.env.STRIPE_PRO_PRICE_ID?.trim() &&
      subscription.stripeStatus &&
      PRO_STATUSES.has(subscription.stripeStatus),
  );
  const platformAiIncluded = pro && config.capabilities.platformLlm;

  return {
    plan: pro ? "pro" : "free",
    platformAiIncluded,
    userEditableLlmSettings: !platformAiIncluded,
    hostedLimits: pro ? PRO_HOSTED_MONTHLY_LIMITS : FREE_HOSTED_MONTHLY_LIMITS,
    subscription: subscription?.stripeStatus
      ? {
          status: subscription.stripeStatus,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
  };
}

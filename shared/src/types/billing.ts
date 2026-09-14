import type { HostedUsageAction, HostedUsageSummary } from "./usage";

export type AccountPlan = "free" | "pro";

export interface AccountSubscriptionSummary {
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

export interface AccountEntitlements {
  plan: AccountPlan;
  platformAiIncluded: boolean;
  userEditableLlmSettings: boolean;
  hostedLimits: Record<HostedUsageAction, number>;
  subscription: AccountSubscriptionSummary | null;
}

export interface BillingStatusResponse extends AccountEntitlements {
  priceGbpMonthly: 30;
  usage: HostedUsageSummary;
}

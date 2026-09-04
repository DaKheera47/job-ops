import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type { BillingStatusResponse } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BillingSettingsSectionProps = {
  status: BillingStatusResponse | undefined;
  isLoading: boolean;
  isBusy: boolean;
  onUpgrade: () => void;
  onManage: () => void;
};

function formatPeriodEnd(value: number | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value * 1_000));
}

export function BillingSettingsSection({
  status,
  isLoading,
  isBusy,
  onUpgrade,
  onManage,
}: BillingSettingsSectionProps) {
  const pro = status?.plan === "pro";
  const periodEnd = formatPeriodEnd(
    status?.subscription?.currentPeriodEnd ?? null,
  );
  const cancellationScheduled = Boolean(
    pro && status?.subscription?.cancelAtPeriodEnd,
  );

  return (
    <SettingsSectionFrame mode="panel" title="Billing" value="billing">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight">
                {pro ? "Pro" : "Free"}
              </h3>
              <Badge variant={pro ? "default" : "secondary"}>
                Current plan
              </Badge>
            </div>
            {pro ? (
              <p className="max-w-xl text-sm text-muted-foreground">
                JobOps-funded AI and higher monthly hosted limits are included.
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Upgrade for included AI and higher monthly hosted limits.
                </p>
                <p className="text-sm font-medium tabular-nums">
                  £30{" "}
                  <span className="font-normal text-muted-foreground">
                    / month
                  </span>
                </p>
              </div>
            )}
            {cancellationScheduled ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Your Pro access remains active
                {periodEnd
                  ? ` until ${periodEnd}`
                  : " until the current period ends"}
                .
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant={pro ? "outline" : "default"}
            disabled={isLoading || isBusy || !status}
            onClick={pro ? onManage : onUpgrade}
          >
            {isBusy
              ? "Opening Stripe…"
              : pro
                ? "Manage subscription"
                : "Upgrade to Pro"}
          </Button>
        </div>
      </div>
    </SettingsSectionFrame>
  );
}

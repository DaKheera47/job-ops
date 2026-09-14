import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type {
  BillingStatusResponse,
  HostedUsageAction,
  HostedUsageActionSummary,
} from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type BillingSettingsSectionProps = {
  status: BillingStatusResponse | undefined;
  isLoading: boolean;
  isBusy: boolean;
  onUpgrade: () => void;
  onManage: () => void;
};

const usageLabels: Record<HostedUsageAction, string> = {
  job_search: "Job-source searches",
  pipeline_run: "Pipeline runs",
  tailoring: "AI operations",
  ghostwriter: "Ghostwriter generations",
  pdf_export: "PDF exports",
};

const numberFormatter = new Intl.NumberFormat("en-GB");

function formatPeriodEnd(value: number | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value * 1_000));
}

function UsageMeter({ usage }: { usage: HostedUsageActionSummary }) {
  const usedUnits = Math.max(0, usage.usedUnits + usage.reservedUnits);
  const percentage = Math.min(100, (usedUnits / usage.limitUnits) * 100);
  const label = usageLabels[usage.action];

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">{label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {numberFormatter.format(usedUnits)} /{" "}
          {numberFormatter.format(usage.limitUnits)}
        </span>
      </div>
      <Progress
        value={percentage}
        aria-label={`${label} usage`}
        aria-valuetext={`${numberFormatter.format(usedUnits)} of ${numberFormatter.format(usage.limitUnits)} used`}
        className={cn(
          "h-1.5 bg-muted [&>div]:bg-foreground/50",
          percentage >= 80 && percentage < 100 && "[&>div]:bg-amber-500",
          percentage >= 100 && "[&>div]:bg-destructive",
        )}
      />
    </li>
  );
}

export function BillingSettingsSection({
  status,
  isLoading,
  isBusy,
  onUpgrade,
  onManage,
}: BillingSettingsSectionProps) {
  const pro = status?.plan === "pro";
  const includedAi = status?.platformAiIncluded;
  const periodEnd = formatPeriodEnd(
    status?.subscription?.currentPeriodEnd ?? null,
  );
  const cancellationScheduled = Boolean(
    pro && status?.subscription?.cancelAtPeriodEnd,
  );

  return (
    <SettingsSectionFrame mode="panel" title="Billing" value="billing">
      <Card className="shadow-none">
        <CardHeader className="flex flex-col gap-6 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">
                <h3>{pro ? "Pro" : "Free"}</h3>
              </CardTitle>
              <Badge variant={pro ? "default" : "secondary"}>
                Current plan
              </Badge>
            </div>
            {pro ? (
              <p className="max-w-xl text-sm text-muted-foreground">
                {includedAi
                  ? "Included AI with higher monthly hosted limits."
                  : "Higher monthly hosted limits. Connect your own AI provider."}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">
                  {includedAi
                    ? "Included AI with lower monthly hosted limits. Upgrade for higher limits."
                    : "Connect your own AI provider. Upgrade for higher monthly hosted limits."}
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
        </CardHeader>

        {status ? (
          <>
            <Separator />
            <CardContent className="flex flex-col gap-5 p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h4 className="font-semibold tracking-tight">Monthly usage</h4>
                <span className="text-xs text-muted-foreground">
                  Resets monthly
                </span>
              </div>
              {status.usage.quotasEnabled ? (
                <ul className="grid gap-4">
                  {status.usage.actions.map((usage) => (
                    <UsageMeter key={usage.action} usage={usage} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Usage limits are not enabled for this workspace.
                </p>
              )}
            </CardContent>
          </>
        ) : null}
      </Card>
    </SettingsSectionFrame>
  );
}

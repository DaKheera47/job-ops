import type { TracerReadinessResponse } from "@shared/types";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import type React from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type TracerLinksSettingsSectionProps = {
  readiness: TracerReadinessResponse | null;
  isLoading: boolean;
  isChecking: boolean;
  onVerifyNow: () => void | Promise<void>;
};

const STALE_AFTER_MS = 15 * 60_000;

function formatLastChecked(value: number | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  return date.toLocaleString();
}

function deriveStatus(
  readiness: TracerReadinessResponse | null,
  isChecking: boolean,
): {
  label: string;
  className: string;
  icon: React.ReactNode;
} {
  if (isChecking) {
    return {
      label: "Checking",
      className: "border-blue-300 text-blue-700",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    };
  }

  if (!readiness) {
    return {
      label: "Not configured",
      className: "border-muted text-muted-foreground",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
    };
  }

  const ageMs = Date.now() - readiness.checkedAt;
  if (ageMs > STALE_AFTER_MS) {
    return {
      label: "Stale",
      className: "border-amber-300 text-amber-700",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
    };
  }

  if (readiness.status === "ready") {
    return {
      label: "Ready",
      className: "border-emerald-300 text-emerald-700",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    };
  }

  if (readiness.status === "unavailable") {
    return {
      label: "Unavailable",
      className: "border-destructive/40 text-destructive",
      icon: <AlertCircle className="h-3.5 w-3.5" />,
    };
  }

  return {
    label: "Not configured",
    className: "border-muted text-muted-foreground",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  };
}

export const TracerLinksSettingsSection: React.FC<
  TracerLinksSettingsSectionProps
> = ({ readiness, isLoading, isChecking, onVerifyNow }) => {
  const statusUi = deriveStatus(readiness, isChecking);
  const publicBaseUrl = readiness?.publicBaseUrl ?? null;
  const checkTimestamp = readiness?.checkedAt ?? null;

  return (
    <AccordionItem value="tracer-links" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Tracer Links</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm">
              {statusUi.icon}
              <span className="font-medium">Readiness</span>
            </div>
            <Badge variant="outline" className={statusUi.className}>
              {statusUi.label}
            </Badge>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              Public URL
            </div>
            <div className="rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs">
              {publicBaseUrl ?? "Not configured"}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Last checked: {formatLastChecked(checkTimestamp)}
          </div>

          {readiness?.reason ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {readiness.reason}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Enable per-job tracer links only when status is Ready.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onVerifyNow()}
              disabled={isLoading || isChecking}
            >
              {isChecking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Verify now
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

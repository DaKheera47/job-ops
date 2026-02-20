/**
 * ChartKpiPanel
 * Reusable stat block used in card headers: label, bold rate, trend icon, subtext.
 */

import { TrendingDown, TrendingUp } from "lucide-react";

interface ChartKpiPanelProps {
  label: string;
  rate: number;
  subtext: string;
  /** Rate below this threshold shows TrendingDown. Default 10. */
  lowThreshold?: number;
  /** Rate above this threshold shows TrendingUp. Default 25. */
  highThreshold?: number;
}

export function ChartKpiPanel({
  label,
  rate,
  subtext,
  lowThreshold = 10,
  highThreshold = 25,
}: ChartKpiPanelProps) {
  return (
    <div className="flex flex-col items-start justify-center gap-3 border-t px-6 py-4 text-left sm:border-t-0 sm:border-l sm:px-8 sm:py-6">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold leading-none sm:text-3xl">
            {rate.toFixed(1)}%
          </span>
          {rate < lowThreshold ? (
            <TrendingDown className="h-4 w-4 text-destructive" />
          ) : rate > highThreshold ? (
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">{subtext}</span>
      </div>
    </div>
  );
}

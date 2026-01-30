/**
 * Freshness Response Chart
 * Shows positive response rate by how quickly jobs were discovered after posting.
 */

import { useMemo } from "react";
import type { TooltipProps } from "recharts";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";

type FreshnessBucket = {
  bucket: string;
  positiveRate: number;
  total: number;
  positive: number;
};

type JobSummary = {
  id: string;
  datePosted: string | null;
  discoveredAt: string;
  appliedAt: string | null;
  positiveResponse: boolean;
};

const chartConfig = {
  positiveRate: {
    label: "Positive response rate",
    color: "var(--chart-2)",
  },
};

const freshnessBuckets = [
  { label: "0-1d", min: 0, max: 1 },
  { label: "2-3d", min: 2, max: 3 },
  { label: "4-7d", min: 4, max: 7 },
  { label: "8-14d", min: 8, max: 14 },
  { label: "15-30d", min: 15, max: 30 },
  { label: "30+d", min: 31, max: Number.POSITIVE_INFINITY },
];

const buildFreshnessData = (jobs: JobSummary[]): FreshnessBucket[] => {
  const counts = new Map<string, { total: number; positive: number }>();
  for (const bucket of freshnessBuckets) {
    counts.set(bucket.label, { total: 0, positive: 0 });
  }

  for (const job of jobs) {
    if (!job.appliedAt) continue;
    if (!job.datePosted) continue;
    const posted = new Date(job.datePosted);
    const discovered = new Date(job.discoveredAt);
    if (Number.isNaN(posted.getTime()) || Number.isNaN(discovered.getTime())) {
      continue;
    }
    const diffMs = discovered.getTime() - posted.getTime();
    if (diffMs < 0) continue;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const bucket = freshnessBuckets.find(
      (entry) => diffDays >= entry.min && diffDays <= entry.max,
    );
    if (!bucket) continue;
    const current = counts.get(bucket.label);
    if (!current) continue;
    current.total += 1;
    if (job.positiveResponse) {
      current.positive += 1;
    }
  }

  return freshnessBuckets.map((bucket) => {
    const entry = counts.get(bucket.label) ?? { total: 0, positive: 0 };
    const positiveRate =
      entry.total > 0 ? (entry.positive / entry.total) * 100 : 0;
    return {
      bucket: bucket.label,
      positiveRate,
      total: entry.total,
      positive: entry.positive,
    };
  });
};

interface FreshnessResponseChartProps {
  jobs: JobSummary[];
  error: string | null;
}

export function FreshnessResponseChart({
  jobs,
  error,
}: FreshnessResponseChartProps) {
  const freshnessData = useMemo(() => {
    return buildFreshnessData(jobs);
  }, [jobs]);

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col gap-2 border-b !p-0">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:!py-0">
          <CardTitle>Positive response rate by posting freshness</CardTitle>
          <CardDescription>
            How quickly you discovered a job after it was posted vs. positive
            responses.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {error ? (
          <div className="px-4 py-6 text-sm text-destructive">{error}</div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[260px] w-full"
          >
            <BarChart
              accessibilityLayer
              data={freshnessData}
              margin={{ left: 12, right: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="bucket"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={{ fill: "var(--chart-1)", opacity: 0.3 }}
                content={({
                  active,
                  payload,
                  label,
                }: TooltipProps<number, string>) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0]?.payload as
                    | FreshnessBucket
                    | undefined;
                  if (!entry) return null;
                  return (
                    <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-sm">
                      <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                        Posted → discovered: {label}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            Positive response rate
                          </span>
                          <span className="font-semibold text-foreground">
                            {entry.positiveRate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            Positive responses
                          </span>
                          <span className="font-semibold text-foreground">
                            {entry.positive}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-semibold text-foreground">
                            {entry.total}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="positiveRate"
                fill="var(--color-positiveRate)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

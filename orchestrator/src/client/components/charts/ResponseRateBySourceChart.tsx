/**
 * Response Rate by Source Chart
 * For each job source, shows the percentage of applications that received
 * any response that isn't a rejection (i.e. at least one positive stage event).
 */

import type { JobSource, StageEvent } from "@shared/types.js";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer } from "@/components/ui/chart";

type JobForSourceChart = {
  id: string;
  source: JobSource;
  appliedAt: string | null;
  events: StageEvent[];
};

type SourceRateDataPoint = {
  source: string;
  applied: number;
  responded: number;
  rate: number;
};

const chartConfig = {
  rate: {
    label: "Response Rate",
    color: "var(--chart-2)",
  },
};

// Stages that constitute a non-rejection response (any positive engagement)
const POSITIVE_RESPONSE_STAGES = new Set([
  "recruiter_screen",
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
]);

const isRejectedEvent = (event: StageEvent) =>
  event.outcome === "rejected" || event.metadata?.reasonCode === "rejected";

const SOURCE_LABELS: Record<JobSource, string> = {
  gradcracker: "Gradcracker",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  glassdoor: "Glassdoor",
  ukvisajobs: "UKVisaJobs",
  adzuna: "Adzuna",
  hiringcafe: "HiringCafe",
  manual: "Manual",
};

// Distinct colors for each bar
const BAR_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

const buildResponseRateBySource = (
  jobs: JobForSourceChart[],
): SourceRateDataPoint[] => {
  const bySource = new Map<JobSource, { applied: number; responded: number }>();

  for (const job of jobs) {
    if (!job.appliedAt) continue;

    const existing = bySource.get(job.source) ?? { applied: 0, responded: 0 };
    existing.applied++;

    // A "non-rejection response" means at least one positive stage event
    // and the job has NOT only seen a rejection outcome
    const hasPositiveResponse = job.events.some((event) =>
      POSITIVE_RESPONSE_STAGES.has(event.toStage),
    );

    // Also count jobs that have any event but no rejection yet (in-progress responses)
    const hasOnlyRejection =
      job.events.length > 0 && job.events.every(isRejectedEvent);

    if (hasPositiveResponse && !hasOnlyRejection) {
      existing.responded++;
    }

    bySource.set(job.source, existing);
  }

  return Array.from(bySource.entries())
    .map(([source, { applied, responded }]) => ({
      source: SOURCE_LABELS[source] ?? source,
      applied,
      responded,
      rate: applied > 0 ? (responded / applied) * 100 : 0,
    }))
    .sort((a, b) => b.applied - a.applied); // sort by volume descending
};

interface ResponseRateBySourceChartProps {
  jobs: JobForSourceChart[];
  error: string | null;
}

export function ResponseRateBySourceChart({
  jobs,
  error,
}: ResponseRateBySourceChartProps) {
  const data = useMemo(() => buildResponseRateBySource(jobs), [jobs]);

  const totalApplied = useMemo(
    () => data.reduce((sum, d) => sum + d.applied, 0),
    [data],
  );
  const totalResponded = useMemo(
    () => data.reduce((sum, d) => sum + d.responded, 0),
    [data],
  );
  const overallRate =
    totalApplied > 0 ? (totalResponded / totalApplied) * 100 : 0;

  const chartHeight = Math.max(120, data.length * 48);

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col gap-2 border-b !p-0 sm:flex-row sm:items-stretch">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:!py-0">
          <CardTitle>Response Rate by Source</CardTitle>
          <CardDescription>
            % of applications that received any non-rejection response, per job
            board.
          </CardDescription>
        </div>
        <div className="flex flex-col items-start justify-center gap-3 border-t px-6 py-4 text-left sm:border-t-0 sm:border-l sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Overall Response Rate
            </span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold leading-none sm:text-3xl">
                {overallRate.toFixed(1)}%
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {totalResponded} of {totalApplied} applications
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {error ? (
          <div className="px-4 py-6 text-sm text-destructive">{error}</div>
        ) : data.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No application data available.
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="w-full"
            style={{ height: chartHeight }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ left: 80, right: 48, top: 4, bottom: 4 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  dataKey="source"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={76}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--chart-2)", opacity: 0.15 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as SourceRateDataPoint;
                    return (
                      <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-sm">
                        <div className="mb-1 font-medium">{d.source}</div>
                        <div className="space-y-1 text-muted-foreground">
                          <div className="flex items-center justify-between gap-4">
                            <span>Response rate</span>
                            <span className="font-semibold text-foreground">
                              {d.rate.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>Responded</span>
                            <span className="font-semibold text-foreground">
                              {d.responded}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>Applied</span>
                            <span className="font-semibold text-foreground">
                              {d.applied}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {data.map((entry, index) => (
                    <Cell
                      key={entry.source}
                      fill={BAR_COLORS[index % BAR_COLORS.length]}
                    />
                  ))}
                  <LabelList
                    dataKey="rate"
                    position="right"
                    formatter={(v: number) => `${v.toFixed(1)}%`}
                    className="text-xs fill-foreground"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

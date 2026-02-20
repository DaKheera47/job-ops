/**
 * Response Rate by Source Chart
 * For each job source, shows the percentage of applications that received
 * a non-rejection response — defined as reaching screening, interview, or offer.
 * Ghosted/no-reply and rejected outcomes are both excluded from the numerator.
 */

import type { JobSource, StageEvent } from "@shared/types.js";
import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChartKpiPanel } from "./ChartKpiPanel";

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

/**
 * Non-rejection response: the application reached screening, interview, or offer.
 * Ghosted (no events) and rejected (outcome=rejected) are both excluded.
 */
const RESPONSE_STAGES = new Set([
  "recruiter_screen",
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
]);

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

/** Minimum applications required for a source to appear by default. */
const MIN_SAMPLE_DEFAULT = 5;

const buildResponseRateBySource = (
  jobs: JobForSourceChart[],
): SourceRateDataPoint[] => {
  const bySource = new Map<JobSource, { applied: number; responded: number }>();

  for (const job of jobs) {
    if (!job.appliedAt) continue;

    const existing = bySource.get(job.source) ?? { applied: 0, responded: 0 };
    existing.applied++;

    const hasResponse = job.events.some((e) => RESPONSE_STAGES.has(e.toStage));
    if (hasResponse) {
      existing.responded++;
    }

    bySource.set(job.source, existing);
  }

  return Array.from(bySource.entries())
    .map(([source, { applied, responded }]) => ({
      source: `${SOURCE_LABELS[source] ?? source} (${applied})`,
      applied,
      responded,
      rate: applied > 0 ? (responded / applied) * 100 : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.applied - a.applied);
};

interface ResponseRateBySourceChartProps {
  jobs: JobForSourceChart[];
  error: string | null;
}

export function ResponseRateBySourceChart({
  jobs,
  error,
}: ResponseRateBySourceChartProps) {
  const [includeSmall, setIncludeSmall] = useState(false);

  const allData = useMemo(() => buildResponseRateBySource(jobs), [jobs]);

  const data = useMemo(
    () =>
      includeSmall
        ? allData
        : allData.filter((d) => d.applied >= MIN_SAMPLE_DEFAULT),
    [allData, includeSmall],
  );

  const hiddenCount = allData.length - data.length;

  const totalApplied = useMemo(
    () => allData.reduce((sum, d) => sum + d.applied, 0),
    [allData],
  );
  const totalResponded = useMemo(
    () => allData.reduce((sum, d) => sum + d.responded, 0),
    [allData],
  );
  const overallRate =
    totalApplied > 0 ? (totalResponded / totalApplied) * 100 : 0;

  const chartHeight = Math.max(80, data.length * 52);

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col gap-2 border-b !p-0 sm:flex-row sm:items-stretch">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:!py-0">
          <CardTitle>Response Rate by Source</CardTitle>
          <CardDescription>
            % of applications that got a response (not rejected or ghosted).
          </CardDescription>
        </div>
        <ChartKpiPanel
          label="Response Rate"
          rate={overallRate}
          subtext={`${totalResponded} of ${totalApplied} applications`}
        />
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {error ? (
          <div className="px-4 py-6 text-sm text-destructive">{error}</div>
        ) : allData.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No application data available.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Minimum sample toggle */}
            <div className="flex items-center justify-end gap-2">
              <Label
                htmlFor="include-small-toggle"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                {includeSmall ? (
                  "All sources"
                ) : (
                  <>
                    n &lt; {MIN_SAMPLE_DEFAULT} hidden
                    {hiddenCount > 0 && (
                      <span className="ml-1 text-muted-foreground/60">
                        ({hiddenCount})
                      </span>
                    )}
                  </>
                )}
              </Label>
              <Switch
                id="include-small-toggle"
                checked={includeSmall}
                onCheckedChange={setIncludeSmall}
                aria-label="Include small samples"
              />
            </div>

            {data.length === 0 ? (
              <div className="px-4 py-4 text-sm text-muted-foreground">
                All sources have fewer than {MIN_SAMPLE_DEFAULT} applications.
                Enable the toggle above to show them.
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
                    margin={{ left: 4, right: 36, top: 4, bottom: 4 }}
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
                      width={108}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--chart-2)", opacity: 0.15 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as SourceRateDataPoint;
                        return (
                          <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-sm">
                            <div className="mb-1.5 font-medium">{d.source}</div>
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
                            </div>
                            <div className="mt-2 border-t pt-1.5 text-[10px] text-muted-foreground/70">
                              Screening, interview, or offer only
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
                        formatter={(v: number) => `${v.toFixed(0)}%`}
                        className="text-xs fill-foreground"
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

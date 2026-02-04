/**
 * Conversion Analytics
 * Shows Application → Response conversion metrics including stage-flow Sankey and time-series insights.
 */

import type { StageEvent } from "@shared/types.js";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Chart } from "react-google-charts";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  getSankeyStageFromEvent,
  getSankeyStageLabel,
  LOGGABLE_STAGE_OPTIONS,
  type SankeyStageValue,
} from "../../constants/loggableStages";

type ConversionDataPoint = {
  date: string;
  conversionRate: number;
  appliedCount: number;
  convertedCount: number;
};

type JobWithEvents = {
  id: string;
  datePosted: string | null;
  discoveredAt: string;
  appliedAt: string | null;
  events: StageEvent[];
};

const chartConfig = {
  conversionRate: {
    label: "Conversion Rate",
    color: "var(--chart-1)",
  },
};

// Stages that count as conversion (any positive response from company)
const CONVERSION_STAGES = new Set([
  "recruiter_screen",
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
]);

const toDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const SANKEY_STAGE_ORDER = LOGGABLE_STAGE_OPTIONS.filter(
  (option) => option.value !== "no_change",
).map((option) => option.value) as SankeyStageValue[];

const SANKEY_STAGES: SankeyStageValue[] = SANKEY_STAGE_ORDER.includes(
  "no_response",
)
  ? SANKEY_STAGE_ORDER
  : [...SANKEY_STAGE_ORDER, "no_response"];

const SANKEY_NODE_COLORS: Record<SankeyStageValue, string> = {
  applied: "#3b82f6",
  recruiter_screen: "#06b6d4",
  assessment: "#f59e0b",
  hiring_manager_screen: "#8b5cf6",
  technical_interview: "#a855f7",
  onsite: "#6366f1",
  offer: "#22c55e",
  rejected: "#ef4444",
  withdrawn: "#f97316",
  no_response: "#0ea5a4",
  closed: "#64748b",
};

const buildSankeyRows = (jobsWithEvents: JobWithEvents[]) => {
  const counts = new Map<string, number>();

  for (const job of jobsWithEvents) {
    const sortedEvents = [...job.events].sort(
      (a, b) => a.occurredAt - b.occurredAt,
    );

    for (const event of sortedEvents) {
      const toStage = getSankeyStageFromEvent(event);
      const fromStage =
        event.fromStage === null
          ? "applied"
          : event.fromStage === "closed" &&
              (event.outcome === "rejected" || event.outcome === "withdrawn")
            ? event.outcome
            : event.fromStage;

      if (fromStage === toStage) continue;

      const transitionKey = `${fromStage}->${toStage}`;
      counts.set(transitionKey, (counts.get(transitionKey) ?? 0) + 1);
    }
  }

  const rows: Array<[string, string, number]> = [];
  for (const fromStage of SANKEY_STAGES) {
    for (const toStage of SANKEY_STAGES) {
      const count = counts.get(`${fromStage}->${toStage}`) ?? 0;
      if (count === 0) continue;
      rows.push([
        getSankeyStageLabel(fromStage),
        getSankeyStageLabel(toStage),
        count,
      ]);
    }
  }

  return rows;
};

// Build conversion rate time-series data
const buildConversionTimeSeries = (
  jobsWithEvents: JobWithEvents[],
  daysToShow: number,
): ConversionDataPoint[] => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (daysToShow - 1));
  start.setHours(0, 0, 0, 0);

  // Group jobs by application date
  const jobsByDate = new Map<string, JobWithEvents[]>();

  for (const job of jobsWithEvents) {
    if (!job.appliedAt) continue;
    const date = new Date(job.appliedAt);
    if (Number.isNaN(date.getTime())) continue;
    if (date < start || date > end) continue;

    const key = toDateKey(date);
    const list = jobsByDate.get(key) ?? [];
    list.push(job);
    jobsByDate.set(key, list);
  }

  // Build time series with rolling conversion rate
  const data: ConversionDataPoint[] = [];
  const rollingWindow = Math.min(7, daysToShow); // 7-day rolling average, capped by daysToShow

  for (
    let day = new Date(start);
    day <= end;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    const key = toDateKey(day);

    // Calculate rolling window range
    const windowStart = new Date(day);
    windowStart.setDate(windowStart.getDate() - rollingWindow + 1);

    let appliedCount = 0;
    let convertedCount = 0;

    // Sum up jobs in the rolling window
    for (
      let windowDay = new Date(windowStart);
      windowDay <= day;
      windowDay = new Date(
        windowDay.getFullYear(),
        windowDay.getMonth(),
        windowDay.getDate() + 1,
      )
    ) {
      const windowKey = toDateKey(windowDay);
      const jobs = jobsByDate.get(windowKey) ?? [];

      for (const job of jobs) {
        appliedCount++;

        // Check if reached any conversion stage
        const reachedConversion = job.events.some((event) =>
          CONVERSION_STAGES.has(event.toStage),
        );
        if (reachedConversion) {
          convertedCount++;
        }
      }
    }

    const conversionRate =
      appliedCount > 0 ? (convertedCount / appliedCount) * 100 : 0;

    data.push({
      date: key,
      conversionRate,
      appliedCount,
      convertedCount,
    });
  }

  return data;
};

// Calculate overall conversion rate
const calculateOverallConversion = (
  jobsWithEvents: JobWithEvents[],
): { rate: number; total: number; converted: number } => {
  let total = 0;
  let converted = 0;

  for (const job of jobsWithEvents) {
    if (!job.appliedAt) continue;
    total++;

    const reachedConversion = job.events.some((event) =>
      CONVERSION_STAGES.has(event.toStage),
    );
    if (reachedConversion) {
      converted++;
    }
  }

  const rate = total > 0 ? (converted / total) * 100 : 0;
  return { rate, total, converted };
};

interface ConversionAnalyticsProps {
  jobsWithEvents: JobWithEvents[];
  error: string | null;
  daysToShow: number;
}

export function ConversionAnalytics({
  jobsWithEvents,
  error,
  daysToShow,
}: ConversionAnalyticsProps) {
  const sankeyRows = useMemo(() => {
    return buildSankeyRows(jobsWithEvents);
  }, [jobsWithEvents]);

  const conversionTimeSeries = useMemo(() => {
    return buildConversionTimeSeries(jobsWithEvents, daysToShow);
  }, [jobsWithEvents, daysToShow]);

  const overallConversion = useMemo(() => {
    return calculateOverallConversion(jobsWithEvents);
  }, [jobsWithEvents]);

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col gap-2 border-b !p-0 sm:flex-row sm:items-stretch">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:!py-0">
          <CardTitle>Application → Response Conversion</CardTitle>
          <CardDescription>
            How many applications received a positive response from the company.
          </CardDescription>
        </div>
        <div className="flex flex-col items-start justify-center gap-3 border-t px-6 py-4 text-left sm:border-t-0 sm:border-l sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Conversion Rate
            </span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold leading-none sm:text-3xl">
                {overallConversion.rate.toFixed(1)}%
              </span>
              {overallConversion.rate < 10 ? (
                <TrendingDown className="h-4 w-4 text-destructive" />
              ) : overallConversion.rate > 25 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {overallConversion.converted} of {overallConversion.total}{" "}
              applications
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {error ? (
          <div className="px-4 py-6 text-sm text-destructive">{error}</div>
        ) : (
          <div className="space-y-6">
            {/* Sankey Stage Flow */}
            <div>
              <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                Stage transition flow (Sankey)
              </h4>
              {sankeyRows.length > 0 ? (
                <div className="h-[260px] overflow-hidden rounded-lg border border-border/60 bg-background p-2">
                  <Chart
                    width="100%"
                    height="100%"
                    chartType="Sankey"
                    loader={
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Loading stage flow...
                      </div>
                    }
                    data={[["From", "To", "Count"], ...sankeyRows]}
                    options={{
                      sankey: {
                        node: {
                          colors: SANKEY_STAGES.map(
                            (stage) => SANKEY_NODE_COLORS[stage],
                          ),
                          label: {
                            fontName:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
                            fontSize: 11,
                          },
                          nodePadding: 14,
                          width: 18,
                        },
                        link: {
                          colorMode: "target",
                          colors: SANKEY_STAGES.map(
                            (stage) => SANKEY_NODE_COLORS[stage],
                          ),
                        },
                      },
                      backgroundColor: "transparent",
                    }}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                  No stage transitions logged yet.
                </div>
              )}
            </div>

            {/* Time Series Chart */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Conversion rate over time (rolling {Math.min(7, daysToShow)}
                  -day average)
                </h4>
              </div>
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-[200px] w-full"
              >
                <LineChart
                  data={conversionTimeSeries}
                  margin={{ left: 12, right: 12, top: 5, bottom: 5 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("en-GB", {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    domain={[0, "auto"]}
                  />
                  <ChartTooltip
                    cursor={{ fill: "var(--chart-1)", opacity: 0.3 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload as ConversionDataPoint;
                      return (
                        <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-sm">
                          <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                            {new Date(label as string).toLocaleDateString(
                              "en-GB",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                Conversion Rate
                              </span>
                              <span className="font-semibold text-foreground">
                                {data.conversionRate.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                Applied ({Math.min(7, daysToShow)}d window)
                              </span>
                              <span className="font-semibold text-foreground">
                                {data.appliedCount}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                Converted
                              </span>
                              <span className="font-semibold text-foreground">
                                {data.convertedCount}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="conversionRate"
                    stroke="var(--color-conversionRate)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

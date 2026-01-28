import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { Home } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { TooltipProps } from "recharts";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DailyApplications = {
  date: string;
  applications: number;
};

type FreshnessBucket = {
  bucket: string;
  positiveRate: number;
  total: number;
  positive: number;
};

const DAY_OPTIONS = [7, 14, 30, 90] as const;
const DEFAULT_DAYS = 30;

const chartConfig = {
  applications: {
    label: "Applications",
    color: "var(--chart-1)",
  },
  positiveRate: {
    label: "Positive response rate",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const toDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildApplicationsPerDay = (
  appliedAt: Array<string | null>,
  daysToShow: number,
) => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (daysToShow - 1));

  const counts = new Map<string, number>();
  for (const value of appliedAt) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (date < start || date > end) continue;
    const key = toDateKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const data: DailyApplications[] = [];
  for (
    let day = new Date(start);
    day <= end;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    const key = toDateKey(day);
    data.push({ date: key, applications: counts.get(key) ?? 0 });
  }

  const total = data.reduce((sum, item) => sum + item.applications, 0);
  return { data, total };
};

const freshnessBuckets = [
  { label: "0-1d", min: 0, max: 1 },
  { label: "2-3d", min: 2, max: 3 },
  { label: "4-7d", min: 4, max: 7 },
  { label: "8-14d", min: 8, max: 14 },
  { label: "15-30d", min: 15, max: 30 },
  { label: "30+d", min: 31, max: Number.POSITIVE_INFINITY },
];

const positiveStages = new Set([
  "recruiter_screen",
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
]);

export const HomePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState<
    Array<{
      id: string;
      datePosted: string | null;
      discoveredAt: string;
      appliedAt: string | null;
      positiveResponse: boolean;
    }>
  >([]);
  const [appliedDates, setAppliedDates] = useState<Array<string | null>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysToShow, setDaysToShow] = useState(() => {
    const initial = Number(searchParams.get("days"));
    return (DAY_OPTIONS as readonly number[]).includes(initial)
      ? initial
      : DEFAULT_DAYS;
  });

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    api
      .getJobs()
      .then(async (response) => {
        if (!isMounted) return;
        const appliedDates = response.jobs.map((job) => job.appliedAt);
        const jobSummaries = response.jobs.map((job) => ({
          id: job.id,
          datePosted: job.datePosted,
          discoveredAt: job.discoveredAt,
          appliedAt: job.appliedAt,
          positiveResponse: false,
        }));

        const appliedJobs = jobSummaries.filter((job) => job.appliedAt);
        const results = await Promise.allSettled(
          appliedJobs.map((job) => api.getJobStageEvents(job.id)),
        );
        const positiveMap = new Map<string, boolean>();
        results.forEach((result, index) => {
          const jobId = appliedJobs[index]?.id;
          if (!jobId) return;
          if (result.status !== "fulfilled") {
            positiveMap.set(jobId, false);
            return;
          }
          const hasPositive = result.value.some((event) =>
            positiveStages.has(event.toStage),
          );
          positiveMap.set(jobId, hasPositive);
        });

        const resolvedJobs = jobSummaries.map((job) => ({
          ...job,
          positiveResponse: positiveMap.get(job.id) ?? false,
        }));

        setJobs(resolvedJobs);
        setAppliedDates(appliedDates);
        setError(null);
      })
      .catch((fetchError) => {
        if (!isMounted) return;
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load applications";
        setError(message);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const { data: chartData, total } = useMemo(() => {
    return buildApplicationsPerDay(appliedDates, daysToShow);
  }, [appliedDates, daysToShow]);

  const freshnessData = useMemo(() => {
    const counts = new Map<string, { total: number; positive: number }>();
    for (const bucket of freshnessBuckets) {
      counts.set(bucket.label, { total: 0, positive: 0 });
    }

    for (const job of jobs) {
      if (!job.appliedAt) continue;
      if (!job.datePosted) continue;
      const posted = new Date(job.datePosted);
      const discovered = new Date(job.discoveredAt);
      if (
        Number.isNaN(posted.getTime()) ||
        Number.isNaN(discovered.getTime())
      ) {
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
      } satisfies FreshnessBucket;
    });
  }, [jobs]);

  const average = useMemo(() => {
    if (chartData.length === 0) return 0;
    return total / chartData.length;
  }, [chartData, total]);

  const handleDaysChange = (value: string) => {
    const parsed = Number(value);
    if (!(DAY_OPTIONS as readonly number[]).includes(parsed)) return;
    setDaysToShow(parsed);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (parsed === DEFAULT_DAYS) {
        next.delete("days");
      } else {
        next.set("days", String(parsed));
      }
      return next;
    });
  };

  return (
    <>
      <PageHeader
        icon={Home}
        title="Home"
        subtitle="Applications over the last month."
      />

      <PageMain>
        <Card className="py-0">
          <CardHeader className="flex flex-col gap-2 border-b !p-0 sm:flex-row sm:items-stretch">
            <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:!py-0">
              <CardTitle>Applications per day</CardTitle>
              <CardDescription>
                {isLoading
                  ? "Loading applied jobs..."
                  : `Last ${daysToShow} days · ${total.toLocaleString()} total`}
              </CardDescription>
            </div>
            <div className="flex flex-col items-start justify-center gap-3 border-t px-6 py-4 text-left sm:border-t-0 sm:border-l sm:px-8 sm:py-6">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Avg / day</span>
                <span className="text-lg font-bold leading-none sm:text-3xl">
                  {average.toFixed(1)}
                </span>
              </div>
              <div className="w-full">
                <span className="text-xs text-muted-foreground">Range</span>
                <div className="mt-2">
                  <Select
                    value={String(daysToShow)}
                    onValueChange={handleDaysChange}
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue placeholder="Days" />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OPTIONS.map((option) => (
                        <SelectItem key={option} value={String(option)}>
                          Last {option} days
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:p-6">
            {error ? (
              <div className="px-4 py-6 text-sm text-destructive">{error}</div>
            ) : (
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-[280px] w-full"
              >
                <BarChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ left: 12, right: 12 }}
                >
                  <CartesianGrid vertical={false} />
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
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="w-[160px]"
                        nameKey="applications"
                        labelFormatter={(value) =>
                          new Date(value as string).toLocaleDateString(
                            "en-GB",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )
                        }
                      />
                    }
                  />
                  <Bar
                    dataKey="applications"
                    fill="var(--color-applications)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="py-0">
          <CardHeader className="flex flex-col gap-2 border-b !p-0">
            <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:!py-0">
              <CardTitle>Positive response rate by posting freshness</CardTitle>
              <CardDescription>
                How quickly you discovered a job after it was posted vs.
                positive responses.
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
                              <span className="text-muted-foreground">
                                Total
                              </span>
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
      </PageMain>
    </>
  );
};

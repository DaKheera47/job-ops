import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { AlertCircle, Home, TrendingDown, TrendingUp } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { TooltipProps } from "recharts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StageEvent } from "../../shared/types";

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

type FunnelStage = {
  name: string;
  value: number;
  fill: string;
};

type ConversionDataPoint = {
  date: string;
  conversionRate: number;
  appliedCount: number;
  interviewCount: number;
};

type JobWithEvents = {
  id: string;
  datePosted: string | null;
  discoveredAt: string;
  appliedAt: string | null;
  positiveResponse: boolean;
  events: StageEvent[];
};

const DAY_OPTIONS = [7, 14, 30, 90] as const;
const DEFAULT_DAYS = 30;
const CONVERSION_WINDOW_OPTIONS = [14, 30] as const;
const DEFAULT_CONVERSION_WINDOW = 14;

const chartConfig = {
  applications: {
    label: "Applications",
    color: "var(--chart-1)",
  },
  positiveRate: {
    label: "Positive response rate",
    color: "var(--chart-2)",
  },
  conversionRate: {
    label: "Conversion Rate",
    color: "var(--chart-3)",
  },
  funnel: {
    label: "Funnel",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

// Stage definitions for funnel
const FUNNEL_STAGES = [
  { key: "applied", label: "Applied", color: "#3b82f6" },
  { key: "screening", label: "Screening", color: "#8b5cf6" },
  { key: "interview", label: "Interview", color: "#f59e0b" },
  { key: "offer", label: "Offer", color: "#10b981" },
] as const;

// Stages that count as "screening"
const SCREENING_STAGES = new Set(["recruiter_screen", "assessment"]);

// Stages that count as "interview"
const INTERVIEW_STAGES = new Set([
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
]);

// Stages that count as "offer"
const OFFER_STAGES = new Set(["offer"]);

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
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (daysToShow - 1));
  start.setHours(0, 0, 0, 0);

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

// Build funnel data from jobs with their stage events
const buildFunnelData = (jobsWithEvents: JobWithEvents[]): FunnelStage[] => {
  let applied = 0;
  let screening = 0;
  let interview = 0;
  let offer = 0;

  for (const job of jobsWithEvents) {
    if (!job.appliedAt) continue;
    applied++;

    const reachedStages = new Set<string>();
    for (const event of job.events) {
      reachedStages.add(event.toStage);
    }

    // Check if reached screening
    for (const stage of SCREENING_STAGES) {
      if (reachedStages.has(stage)) {
        screening++;
        break;
      }
    }

    // Check if reached interview
    for (const stage of INTERVIEW_STAGES) {
      if (reachedStages.has(stage)) {
        interview++;
        break;
      }
    }

    // Check if reached offer
    for (const stage of OFFER_STAGES) {
      if (reachedStages.has(stage)) {
        offer++;
        break;
      }
    }
  }

  return [
    { name: "Applied", value: applied, fill: FUNNEL_STAGES[0].color },
    { name: "Screening", value: screening, fill: FUNNEL_STAGES[1].color },
    { name: "Interview", value: interview, fill: FUNNEL_STAGES[2].color },
    { name: "Offer", value: offer, fill: FUNNEL_STAGES[3].color },
  ];
};

// Build conversion rate time-series data
const buildConversionTimeSeries = (
  jobsWithEvents: JobWithEvents[],
  windowDays: number,
): ConversionDataPoint[] => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (windowDays - 1));
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
  const rollingWindow = 7; // 7-day rolling average

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
    let interviewCount = 0;

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

        // Check if reached interview stage
        const reachedInterview = job.events.some((event) =>
          INTERVIEW_STAGES.has(event.toStage),
        );
        if (reachedInterview) {
          interviewCount++;
        }
      }
    }

    const conversionRate =
      appliedCount > 0 ? (interviewCount / appliedCount) * 100 : 0;

    data.push({
      date: key,
      conversionRate,
      appliedCount,
      interviewCount,
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

    const reachedInterview = job.events.some((event) =>
      INTERVIEW_STAGES.has(event.toStage),
    );
    if (reachedInterview) {
      converted++;
    }
  }

  const rate = total > 0 ? (converted / total) * 100 : 0;
  return { rate, total, converted };
};

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
  const [jobsWithEvents, setJobsWithEvents] = useState<JobWithEvents[]>([]);
  const [appliedDates, setAppliedDates] = useState<Array<string | null>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysToShow, setDaysToShow] = useState(() => {
    const initial = Number(searchParams.get("days"));
    return (DAY_OPTIONS as readonly number[]).includes(initial)
      ? initial
      : DEFAULT_DAYS;
  });
  const [conversionWindow, setConversionWindow] = useState(() => {
    const initial = Number(searchParams.get("conversionWindow"));
    return (CONVERSION_WINDOW_OPTIONS as readonly number[]).includes(initial)
      ? initial
      : DEFAULT_CONVERSION_WINDOW;
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
        const eventsMap = new Map<string, StageEvent[]>();

        results.forEach((result, index) => {
          const jobId = appliedJobs[index]?.id;
          if (!jobId) return;
          if (result.status !== "fulfilled") {
            positiveMap.set(jobId, false);
            eventsMap.set(jobId, []);
            return;
          }
          const events = result.value;
          eventsMap.set(jobId, events);
          const hasPositive = events.some((event) =>
            positiveStages.has(event.toStage),
          );
          positiveMap.set(jobId, hasPositive);
        });

        const resolvedJobs = jobSummaries.map((job) => ({
          ...job,
          positiveResponse: positiveMap.get(job.id) ?? false,
        }));

        // Build jobs with events for conversion analytics
        const resolvedJobsWithEvents: JobWithEvents[] = jobSummaries
          .filter((job) => job.appliedAt)
          .map((job) => ({
            ...job,
            events: eventsMap.get(job.id) ?? [],
          }));

        setJobs(resolvedJobs);
        setJobsWithEvents(resolvedJobsWithEvents);
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

  // Conversion analytics calculations
  const funnelData = useMemo(() => {
    return buildFunnelData(jobsWithEvents);
  }, [jobsWithEvents]);

  const conversionTimeSeries = useMemo(() => {
    return buildConversionTimeSeries(jobsWithEvents, conversionWindow);
  }, [jobsWithEvents, conversionWindow]);

  const overallConversion = useMemo(() => {
    return calculateOverallConversion(jobsWithEvents);
  }, [jobsWithEvents]);

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

  const handleConversionWindowChange = (value: string) => {
    const parsed = Number(value);
    if (!(CONVERSION_WINDOW_OPTIONS as readonly number[]).includes(parsed))
      return;
    setConversionWindow(parsed);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (parsed === DEFAULT_CONVERSION_WINDOW) {
        next.delete("conversionWindow");
      } else {
        next.set("conversionWindow", String(parsed));
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

        <Card className="py-0">
          <CardHeader className="flex flex-col gap-2 border-b !p-0 sm:flex-row sm:items-stretch">
            <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:!py-0">
              <CardTitle>Application → Interview Conversion</CardTitle>
              <CardDescription>
                Why it matters: tells you whether your targeting and CV are
                working.
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
                {/* Funnel Chart */}
                <div>
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                    Funnel: Applied → Screening → Interview → Offer
                  </h4>
                  <ChartContainer
                    config={chartConfig}
                    className="aspect-auto h-[200px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={funnelData}
                        layout="vertical"
                        margin={{ left: 60, right: 20, top: 5, bottom: 5 }}
                      >
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          tickLine={false}
                          axisLine={false}
                          width={80}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload as FunnelStage;
                            return (
                              <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-sm">
                                <div className="font-medium">{data.name}</div>
                                <div className="mt-1 text-muted-foreground">
                                  {data.value} applications
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {funnelData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                          <LabelList
                            dataKey="value"
                            position="right"
                            className="text-xs fill-foreground"
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>

                {/* Time Series Chart */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Conversion rate over time (rolling 7-day average)
                    </h4>
                    <Tabs
                      value={String(conversionWindow)}
                      onValueChange={handleConversionWindowChange}
                    >
                      <TabsList className="h-7">
                        {CONVERSION_WINDOW_OPTIONS.map((option) => (
                          <TabsTrigger
                            key={option}
                            value={String(option)}
                            className="px-2 text-xs"
                          >
                            {option}d
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
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
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const data = payload[0]
                            .payload as ConversionDataPoint;
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
                                    Applied (7d window)
                                  </span>
                                  <span className="font-semibold text-foreground">
                                    {data.appliedCount}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">
                                    Reached Interview
                                  </span>
                                  <span className="font-semibold text-foreground">
                                    {data.interviewCount}
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

                {/* Actionable Insight */}
                {overallConversion.rate < 15 &&
                  overallConversion.total >= 10 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/50">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-200">
                            Low conversion detected
                          </p>
                          <p className="mt-1 text-amber-700 dark:text-amber-300">
                            Your application-to-interview rate is below 15%.
                            Possible causes: bad targeting, CV mismatch, or late
                            applications. Consider reviewing your CV alignment
                            with job requirements and applying to roles within 3
                            days of posting.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      </PageMain>
    </>
  );
};

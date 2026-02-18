import * as api from "@client/api";
import { PageHeader, PageMain, SectionCard } from "@client/components/layout";
import type {
  JobTracerLinksResponse,
  TracerAnalyticsResponse,
  TracerAnalyticsTopJob,
} from "@shared/types.js";
import { BarChart3, Link2, Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const chartConfig = {
  clicks: {
    label: "Clicks",
    color: "var(--chart-1)",
  },
};

function formatUnixTimestamp(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return new Date(value * 1000).toLocaleString();
}

function formatRecentActivity(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const date = new Date(value * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const timeText = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (date >= today) return `Today ${timeText}`;
  if (date >= yesterday) return `Yesterday ${timeText}`;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function toUnixStartOfDay(value: string): number | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.floor(date.getTime() / 1000);
}

function toUnixEndOfDay(value: string): number | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59`);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.floor(date.getTime() / 1000);
}

function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function normalizeHeadingLabel(
  label: string | null | undefined,
): string | null {
  const text = (label ?? "").trim();
  if (!text) return null;
  if (/^[a-z]+\..*\.url\.href$/i.test(text)) return null;
  return text;
}

export const TracerLinksPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<TracerAnalyticsResponse | null>(
    null,
  );
  const [jobDrilldown, setJobDrilldown] =
    useState<JobTracerLinksResponse | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [includeBots, setIncludeBots] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrilldownLoading, setIsDrilldownLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      from: toUnixStartOfDay(fromDate),
      to: toUnixEndOfDay(toDate),
      includeBots,
      limit: 20,
    }),
    [fromDate, toDate, includeBots],
  );

  const loadJobDrilldown = async (targetJobId: string) => {
    if (!targetJobId) {
      setError("Enter a Job ID to load link drilldown.");
      setJobDrilldown(null);
      return;
    }

    try {
      setIsDrilldownLoading(true);
      setError(null);
      const response = await api.getJobTracerLinks(targetJobId, {
        from: query.from,
        to: query.to,
        includeBots,
      });
      setJobDrilldown(response);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load job tracer links.";
      setError(message);
      setJobDrilldown(null);
    } finally {
      setIsDrilldownLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    api
      .getTracerAnalytics(query)
      .then((response) => {
        if (!isMounted) return;
        setAnalytics(response);
      })
      .catch((fetchError) => {
        if (!isMounted) return;
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to load tracer analytics.";
        setError(message);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [query]);

  const chartData = analytics?.timeSeries ?? [];
  const totalViews = analytics?.totals.clicks ?? 0;
  const humanClicks = analytics?.totals.humanClicks ?? 0;
  const uniqueJobsReached = useMemo(() => {
    if (!analytics) return 0;
    const jobIds = new Set(analytics.topJobs.map((job) => job.jobId));
    if (jobIds.size > 0) return jobIds.size;
    for (const row of analytics.topLinks) {
      jobIds.add(row.jobId);
    }
    return jobIds.size;
  }, [analytics]);

  const visibleDays = useMemo(() => {
    if (query.from && query.to && query.to >= query.from) {
      const secondsPerDay = 24 * 60 * 60;
      return Math.floor((query.to - query.from) / secondsPerDay) + 1;
    }
    return chartData.length > 0 ? chartData.length : 30;
  }, [chartData.length, query.from, query.to]);

  const selectedJobId = jobDrilldown?.job.id ?? null;

  const handleSelectTopJob = (job: TracerAnalyticsTopJob) => {
    void loadJobDrilldown(job.jobId);
  };

  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Tracer Links"
        subtitle="Outbound resume link analytics"
      />

      <PageMain>
        <SectionCard className="p-0">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="filters" className="border-none">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="text-sm font-semibold">Filters</div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="space-y-1">
                    <Label htmlFor="tracer-from-date">From date</Label>
                    <Input
                      id="tracer-from-date"
                      type="date"
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tracer-to-date">To date</Label>
                    <Input
                      id="tracer-to-date"
                      type="date"
                      value={toDate}
                      onChange={(event) => setToDate(event.target.value)}
                    />
                  </div>
                  <label
                    htmlFor="tracer-include-bots"
                    className="flex cursor-pointer items-end gap-2 pb-2"
                  >
                    <Checkbox
                      id="tracer-include-bots"
                      checked={includeBots}
                      onCheckedChange={(checked) =>
                        setIncludeBots(Boolean(checked))
                      }
                    />
                    <span className="text-sm">Include likely bots</span>
                  </label>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </SectionCard>

        {error && (
          <SectionCard>
            <p className="text-sm text-destructive">{error}</p>
          </SectionCard>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <SectionCard className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Views</p>
            <p className="text-3xl font-semibold tabular-nums">
              {totalViews.toLocaleString()}
            </p>
          </SectionCard>
          <SectionCard className="space-y-1">
            <p className="text-xs text-muted-foreground">Unique Jobs Reached</p>
            <p className="text-3xl font-semibold tabular-nums">
              {uniqueJobsReached.toLocaleString()}
            </p>
          </SectionCard>
          <SectionCard className="space-y-1">
            <p className="text-xs text-muted-foreground">Human Clicks</p>
            <p className="text-3xl font-semibold tabular-nums">
              {humanClicks.toLocaleString()}
            </p>
          </SectionCard>
        </div>

        <SectionCard className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">
                Resume Clicks Last {visibleDays} Days
              </h2>
              <p className="text-xs text-muted-foreground">
                Daily click activity from tracer links.
              </p>
            </div>
          </div>
          {isLoading ? (
            <div className="flex h-[240px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading analytics...
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={(value) => formatDayLabel(String(value))}
                />
                <YAxis axisLine={false} tickLine={false} width={30} />
                <ChartTooltip
                  cursor={{ fill: "var(--color-clicks)", opacity: 0.18 }}
                  content={
                    <ChartTooltipContent
                      nameKey="clicks"
                      labelFormatter={(value) => formatDayLabel(String(value))}
                    />
                  }
                />
                <Bar
                  dataKey="clicks"
                  fill="var(--color-clicks)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </SectionCard>

        <section className="grid gap-4 lg:grid-cols-2">
          <SectionCard>
            <div className="mb-3">
              <h3 className="text-sm font-semibold">Application Activity</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="w-[90px]">Clicks</TableHead>
                  <TableHead className="w-[140px]">Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(analytics?.topJobs ?? []).map((row) => (
                  <TableRow
                    key={row.jobId}
                    className="cursor-pointer"
                    data-state={
                      selectedJobId === row.jobId ? "selected" : undefined
                    }
                    onClick={() => handleSelectTopJob(row)}
                  >
                    <TableCell>
                      <div className="font-medium">{row.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.employer}
                      </div>
                    </TableCell>
                    <TableCell>{row.clicks}</TableCell>
                    <TableCell>
                      {formatRecentActivity(row.lastClickedAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {(analytics?.topJobs.length ?? 0) === 0 && !isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-sm text-muted-foreground"
                    >
                      No tracer-link activity yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </SectionCard>

          <SectionCard>
            <div className="mb-3">
              <h3 className="text-sm font-semibold">
                Job Drilldown
                {jobDrilldown ? `: ${jobDrilldown.job.employer}` : ""}
              </h3>
            </div>
            {isDrilldownLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading drilldown...
              </div>
            ) : jobDrilldown ? (
              <div className="space-y-2">
                {jobDrilldown.links.map((row) => (
                  <div
                    key={row.tracerLinkId}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      {normalizeHeadingLabel(row.sourceLabel) ? (
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Link2 className="h-4 w-4 text-muted-foreground" />
                          <span className="truncate">
                            {normalizeHeadingLabel(row.sourceLabel)}
                          </span>
                        </div>
                      ) : null}
                      <p className="truncate text-xs text-muted-foreground">
                        {row.destinationUrl}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Last click: {formatUnixTimestamp(row.lastClickedAt)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {row.clicks} Clicks
                    </p>
                  </div>
                ))}
                {jobDrilldown.links.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No tracer links recorded for this job yet.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a job in Application Activity to inspect link details.
              </p>
            )}
          </SectionCard>
        </section>
      </PageMain>
    </>
  );
};

import * as api from "@client/api";
import { PageHeader, PageMain, SectionCard } from "@client/components/layout";
import type {
  JobTracerLinkAnalyticsItem,
  TracerAnalyticsResponse,
  TracerAnalyticsTopJob,
} from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Copy, ExternalLink, Loader2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { queryKeys } from "@/client/lib/queryKeys";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { copyTextToClipboard } from "@/lib/utils";

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

function formatRelativeTime(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "No activity yet";
  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - value);
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export const TracerLinksPage: React.FC = () => {
  const [selectedDrilldownJobId, setSelectedDrilldownJobId] = useState<
    string | null
  >(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [includeBots, setIncludeBots] = useState(false);
  const [isDrilldownOpen, setIsDrilldownOpen] = useState(false);
  const [drilldownMode, setDrilldownMode] = useState<"human" | "all">("human");

  const query = useMemo(
    () => ({
      from: toUnixStartOfDay(fromDate),
      to: toUnixEndOfDay(toDate),
      includeBots,
      limit: 20,
    }),
    [fromDate, toDate, includeBots],
  );

  const analyticsQuery = useQuery<TracerAnalyticsResponse>({
    queryKey: queryKeys.tracer.analytics(query),
    queryFn: () => api.getTracerAnalytics(query),
  });
  const analytics = analyticsQuery.data ?? null;
  const isLoading = analyticsQuery.isPending;

  const jobDrilldownQuery = useQuery({
    queryKey: queryKeys.tracer.jobLinks(selectedDrilldownJobId ?? "", {
      from: query.from,
      to: query.to,
      includeBots,
    }),
    queryFn: () =>
      api.getJobTracerLinks(selectedDrilldownJobId ?? "", {
        from: query.from,
        to: query.to,
        includeBots,
      }),
    enabled: Boolean(isDrilldownOpen && selectedDrilldownJobId),
  });
  const jobDrilldown = jobDrilldownQuery.data ?? null;
  const isDrilldownLoading =
    jobDrilldownQuery.isPending || jobDrilldownQuery.isFetching;
  const error =
    analyticsQuery.error instanceof Error
      ? analyticsQuery.error.message
      : jobDrilldownQuery.error instanceof Error
        ? jobDrilldownQuery.error.message
        : null;

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
  const drilldownGroupedLinks = useMemo(() => {
    if (!jobDrilldown) {
      return { active: [], inactive: [] } as const;
    }

    const hasActivity = (row: JobTracerLinkAnalyticsItem) =>
      drilldownMode === "human" ? row.humanClicks > 0 : row.clicks > 0;
    const uniqueOpens = (row: JobTracerLinkAnalyticsItem) =>
      drilldownMode === "human" ? row.humanClicks : row.uniqueOpens;

    const active = jobDrilldown.links.filter(hasActivity).sort((a, b) => {
      const lastClickDelta = (b.lastClickedAt ?? 0) - (a.lastClickedAt ?? 0);
      if (lastClickDelta !== 0) return lastClickDelta;
      const uniqueDelta = uniqueOpens(b) - uniqueOpens(a);
      if (uniqueDelta !== 0) return uniqueDelta;
      return b.humanClicks - a.humanClicks;
    });

    const inactive = jobDrilldown.links
      .filter((row) => !hasActivity(row))
      .sort((a, b) => a.destinationUrl.localeCompare(b.destinationUrl));

    return { active, inactive } as const;
  }, [drilldownMode, jobDrilldown]);
  const drilldownSummary = useMemo(() => {
    if (!jobDrilldown) return null;
    const rows = jobDrilldown.links;
    const humanClicks = rows.reduce((total, row) => total + row.humanClicks, 0);
    const totalClicks = rows.reduce(
      (total, row) =>
        total + (drilldownMode === "human" ? row.humanClicks : row.clicks),
      0,
    );
    const lastActivityAt = rows.reduce<number | null>((latest, row) => {
      const count = drilldownMode === "human" ? row.humanClicks : row.clicks;
      if (count <= 0 || row.lastClickedAt === null) return latest;
      if (latest === null || row.lastClickedAt > latest)
        return row.lastClickedAt;
      return latest;
    }, null);
    return { humanClicks, totalClicks, lastActivityAt };
  }, [drilldownMode, jobDrilldown]);

  const handleCopyDestination = async (destinationUrl: string) => {
    try {
      await copyTextToClipboard(destinationUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };
  const getRowClicks = (row: JobTracerLinkAnalyticsItem) =>
    drilldownMode === "human" ? row.humanClicks : row.clicks;

  const handleSelectTopJob = (job: TracerAnalyticsTopJob) => {
    setSelectedDrilldownJobId(job.jobId);
    setIsDrilldownOpen(true);
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

        <Dialog open={isDrilldownOpen} onOpenChange={setIsDrilldownOpen}>
          <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                Job Links{jobDrilldown ? `: ${jobDrilldown.job.title}` : ""}
              </DialogTitle>
              <DialogDescription>
                Destination links and click activity for the selected job.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 overflow-y-auto pr-1">
              {isDrilldownLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading links...
                </div>
              ) : jobDrilldown ? (
                <>
                  <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="grid gap-2 text-xs sm:grid-cols-3">
                      <p>
                        Human clicks:{" "}
                        <span className="font-semibold tabular-nums">
                          {drilldownSummary?.humanClicks ?? 0}
                        </span>
                      </p>
                      <p>
                        Total clicks:{" "}
                        <span className="font-semibold tabular-nums">
                          {drilldownSummary?.totalClicks ?? 0}
                        </span>
                      </p>
                      <p>
                        Last activity:{" "}
                        <span className="font-semibold">
                          {formatRelativeTime(
                            drilldownSummary?.lastActivityAt ?? null,
                          )}
                        </span>
                      </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          drilldownMode === "human" ? "default" : "outline"
                        }
                        onClick={() => setDrilldownMode("human")}
                      >
                        Human only
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          drilldownMode === "all" ? "default" : "outline"
                        }
                        onClick={() => setDrilldownMode("all")}
                      >
                        Human + bots
                      </Button>
                    </div>
                  </div>
                  {drilldownGroupedLinks.active.map((row) => (
                    <div
                      key={row.tracerLinkId}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{row.destinationUrl}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          Last click: {formatUnixTimestamp(row.lastClickedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold tabular-nums">
                          {getRowClicks(row)} Clicks
                        </p>
                        <a
                          href={row.destinationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex"
                        >
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() =>
                            void handleCopyDestination(row.destinationUrl)
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {drilldownGroupedLinks.inactive.length > 0 && (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="inactive-links">
                        <AccordionTrigger className="py-2 text-sm hover:no-underline">
                          No activity yet (
                          {drilldownGroupedLinks.inactive.length})
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-1">
                          {drilldownGroupedLinks.inactive.map((row) => (
                            <div
                              key={row.tracerLinkId}
                              className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm">
                                  {row.destinationUrl}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  Last click:{" "}
                                  {formatUnixTimestamp(row.lastClickedAt)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold tabular-nums">
                                  {getRowClicks(row)} Clicks
                                </p>
                                <a
                                  href={row.destinationUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex"
                                >
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </a>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() =>
                                    void handleCopyDestination(
                                      row.destinationUrl,
                                    )
                                  }
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                  {jobDrilldown.links.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No tracer links recorded for this job yet.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a job from Application Activity.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </PageMain>
    </>
  );
};

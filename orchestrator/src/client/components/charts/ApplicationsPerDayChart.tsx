/**
 * Applications Per Day Chart
 * Shows daily application volume over a selected time range.
 */

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

type DailyApplications = {
  date: string;
  applications: number;
};

const chartConfig = {
  applications: {
    label: "Applications",
    color: "var(--chart-1)",
  },
};

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

interface ApplicationsPerDayChartProps {
  appliedAt: Array<string | null>;
  isLoading: boolean;
  error: string | null;
  daysToShow: number;
}

export function ApplicationsPerDayChart({
  appliedAt,
  isLoading,
  error,
  daysToShow,
}: ApplicationsPerDayChartProps) {
  const { data: chartData, total } = useMemo(() => {
    return buildApplicationsPerDay(appliedAt, daysToShow);
  }, [appliedAt, daysToShow]);

  const average = useMemo(() => {
    if (chartData.length === 0) return 0;
    return total / chartData.length;
  }, [chartData, total]);

  return (
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
                cursor={{ fill: "var(--chart-1)", opacity: 0.3 }}
                content={
                  <ChartTooltipContent
                    className="w-[160px]"
                    nameKey="applications"
                    labelFormatter={(value) =>
                      new Date(value as string).toLocaleDateString("en-GB", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
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
  );
}

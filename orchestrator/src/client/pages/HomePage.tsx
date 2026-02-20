import * as api from "@client/api";
import {
  ApplicationsPerDayChart,
  ConversionAnalytics,
  DurationSelector,
  type DurationValue,
  ResponseRateBySourceChart,
} from "@client/components/charts";
import { PageHeader, PageMain } from "@client/components/layout";
import type { JobSource, StageEvent } from "@shared/types.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartColumn } from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { queryKeys } from "@/client/lib/queryKeys";

type JobWithEvents = {
  id: string;
  source: JobSource;
  datePosted: string | null;
  discoveredAt: string;
  appliedAt: string | null;
  events: StageEvent[];
};

const DURATION_OPTIONS = [7, 14, 30, 90] as const;
const DEFAULT_DURATION = 30;

export const HomePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial duration from URL
  const initialDuration: DurationValue = (() => {
    const value = Number(searchParams.get("duration"));
    return (
      (DURATION_OPTIONS as readonly number[]).includes(value)
        ? value
        : DEFAULT_DURATION
    ) as DurationValue;
  })();

  const [duration, setDuration] = useState<DurationValue>(initialDuration);

  const overviewQuery = useQuery({
    queryKey: queryKeys.jobs.list({
      statuses: ["applied", "in_progress"],
      view: "list",
    }),
    queryFn: async () => {
      const response = await api.getJobs({
        statuses: ["applied", "in_progress"],
        view: "list",
      });
      const appliedDates = response.jobs.map((job) => job.appliedAt);
      const jobSummaries = response.jobs.map((job) => ({
        id: job.id,
        source: job.source,
        datePosted: job.datePosted,
        discoveredAt: job.discoveredAt,
        appliedAt: job.appliedAt,
      }));

      const appliedJobs = jobSummaries.filter((job) => job.appliedAt);
      const results = await Promise.allSettled(
        appliedJobs.map((job) =>
          queryClient.fetchQuery({
            queryKey: queryKeys.jobs.stageEvents(job.id),
            queryFn: () => api.getJobStageEvents(job.id),
            staleTime: 0,
          }),
        ),
      );
      const eventsMap = new Map<string, StageEvent[]>();

      results.forEach((result, index) => {
        const jobId = appliedJobs[index]?.id;
        if (!jobId) return;
        if (result.status !== "fulfilled") {
          eventsMap.set(jobId, []);
          return;
        }
        eventsMap.set(jobId, result.value);
      });

      const jobsWithEvents: JobWithEvents[] = jobSummaries
        .filter((job) => job.appliedAt)
        .map((job) => ({
          ...job,
          events: eventsMap.get(job.id) ?? [],
        }));

      return { jobsWithEvents, appliedDates };
    },
  });

  const jobsWithEvents = useMemo(
    () => overviewQuery.data?.jobsWithEvents ?? [],
    [overviewQuery.data],
  );
  const appliedDates = useMemo(
    () => overviewQuery.data?.appliedDates ?? [],
    [overviewQuery.data],
  );
  const error = overviewQuery.error
    ? overviewQuery.error instanceof Error
      ? overviewQuery.error.message
      : "Failed to load applications"
    : null;
  const isLoading = overviewQuery.isLoading;

  const handleDurationChange = useCallback(
    (newDuration: DurationValue) => {
      setDuration(newDuration);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (newDuration === DEFAULT_DURATION) {
          next.delete("duration");
        } else {
          next.set("duration", String(newDuration));
        }
        // Clean up old params
        next.delete("days");
        next.delete("conversionWindow");
        return next;
      });
    },
    [setSearchParams],
  );

  return (
    <>
      <PageHeader
        icon={ChartColumn}
        title="Overview"
        subtitle="Analytics & Insights"
        actions={
          <DurationSelector value={duration} onChange={handleDurationChange} />
        }
      />

      <PageMain>
        <ApplicationsPerDayChart
          appliedAt={appliedDates}
          isLoading={isLoading}
          error={error}
          daysToShow={duration}
        />

        <ConversionAnalytics
          jobsWithEvents={jobsWithEvents}
          error={error}
          daysToShow={duration}
        />

        <ResponseRateBySourceChart jobs={jobsWithEvents} error={error} />
      </PageMain>
    </>
  );
};

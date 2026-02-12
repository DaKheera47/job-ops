import * as api from "@client/api";
import {
  ApplicationsPerDayChart,
  ConversionAnalytics,
  DurationSelector,
  type DurationValue,
} from "@client/components/charts";
import { PageHeader, PageMain } from "@client/components/layout";
import type { StageEvent } from "@shared/types.js";
import { ChartColumn } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

type JobWithEvents = {
  id: string;
  datePosted: string | null;
  discoveredAt: string;
  appliedAt: string | null;
  events: StageEvent[];
};

const DURATION_OPTIONS = [7, 14, 30, 90] as const;
const DEFAULT_DURATION = 30;

export const HomePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobsWithEvents, setJobsWithEvents] = useState<JobWithEvents[]>([]);
  const [appliedDates, setAppliedDates] = useState<Array<string | null>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    api
      .getJobs({
        statuses: ["applied", "in_progress"],
        view: "list",
      })
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

        const resolvedJobsWithEvents: JobWithEvents[] = jobSummaries
          .filter((job) => job.appliedAt)
          .map((job) => ({
            ...job,
            events: eventsMap.get(job.id) ?? [],
          }));

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
      </PageMain>
    </>
  );
};

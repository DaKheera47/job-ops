import * as api from "@client/api";
import {
  ApplicationsPerDayChart,
  ConversionAnalytics,
  FreshnessResponseChart,
} from "@client/components/charts";
import { PageHeader, PageMain } from "@client/components/layout";
import { Home } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { StageEvent } from "../../shared/types";

type JobSummary = {
  id: string;
  datePosted: string | null;
  discoveredAt: string;
  appliedAt: string | null;
  positiveResponse: boolean;
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
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobsWithEvents, setJobsWithEvents] = useState<JobWithEvents[]>([]);
  const [appliedDates, setAppliedDates] = useState<Array<string | null>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read initial values from URL
  const initialDays = (() => {
    const value = Number(searchParams.get("days"));
    return (DAY_OPTIONS as readonly number[]).includes(value)
      ? value
      : DEFAULT_DAYS;
  })();

  const initialConversionWindow = (() => {
    const value = Number(searchParams.get("conversionWindow"));
    return (CONVERSION_WINDOW_OPTIONS as readonly number[]).includes(value)
      ? value
      : DEFAULT_CONVERSION_WINDOW;
  })();

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    api
      .getJobs()
      .then(async (response) => {
        if (!isMounted) return;
        const appliedDates = response.jobs.map((job) => job.appliedAt);
        const jobSummaries: JobSummary[] = response.jobs.map((job) => ({
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

  const handleDaysChange = (days: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (days === DEFAULT_DAYS) {
        next.delete("days");
      } else {
        next.set("days", String(days));
      }
      return next;
    });
  };

  const handleConversionWindowChange = (window: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (window === DEFAULT_CONVERSION_WINDOW) {
        next.delete("conversionWindow");
      } else {
        next.set("conversionWindow", String(window));
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
        <ApplicationsPerDayChart
          appliedAt={appliedDates}
          isLoading={isLoading}
          error={error}
          initialDays={initialDays}
          onDaysChange={handleDaysChange}
        />

        <FreshnessResponseChart jobs={jobs} error={error} />

        <ConversionAnalytics
          jobsWithEvents={jobsWithEvents}
          error={error}
          initialWindow={initialConversionWindow}
          onWindowChange={handleConversionWindowChange}
        />
      </PageMain>
    </>
  );
};

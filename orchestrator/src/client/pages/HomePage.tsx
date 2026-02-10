import * as api from "@client/api";
import {
  ApplicationsPerDayChart,
  ConversionAnalytics,
  DurationSelector,
  type DurationValue,
} from "@client/components/charts";
import { PageMain } from "@client/components/layout";
import type { StageEvent } from "@shared/types.js";
import { ChartColumn, Menu } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isNavActive, NAV_LINKS } from "../components/navigation";

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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [navOpen, setNavOpen] = useState(false);
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
        statuses: ["applied"],
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

  const handleNavClick = (to: string, activePaths?: string[]) => {
    if (isNavActive(location.pathname, to, activePaths)) {
      setNavOpen(false);
      return;
    }
    setNavOpen(false);
    setTimeout(() => navigate(to), 150);
  };

  return (
    <>
      {/* Custom Header with Duration Selector */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <SheetHeader>
                  <SheetTitle>JobOps</SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-2">
                  {NAV_LINKS.map(
                    ({ to, label, icon: NavIcon, activePaths }) => (
                      <button
                        key={to}
                        type="button"
                        onClick={() => handleNavClick(to, activePaths)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                          isNavActive(location.pathname, to, activePaths)
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <NavIcon className="h-4 w-4" />
                        {label}
                      </button>
                    ),
                  )}
                </nav>
              </SheetContent>
            </Sheet>

            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
              <ChartColumn className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold tracking-tight">
              Job Ops
            </div>
            <div className="text-xs text-muted-foreground">Orchestrator</div>
          </div>

          <div className="flex items-center gap-2">
            <DurationSelector
              value={duration}
              onChange={handleDurationChange}
            />
          </div>
        </div>
      </header>

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

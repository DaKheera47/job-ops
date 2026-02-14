import {
  APPLICATION_STAGES,
  type ApplicationStage,
  type JobListItem,
  STAGE_LABELS,
  type StageEvent,
} from "@shared/types.js";
import { Columns3, ExternalLink } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader, PageMain } from "@client/components/layout";
import { Badge } from "@/components/ui/badge";
import { cn, formatTimestamp } from "@/lib/utils";
import * as api from "../api";
import { JobStatusBadge } from "./orchestrator/JobStatusBadge";

type BoardCard = {
  job: JobListItem;
  stage: ApplicationStage;
  latestEventAt: number | null;
};

const sortByRecent = (a: BoardCard, b: BoardCard) => {
  if (a.latestEventAt != null && b.latestEventAt != null) {
    return b.latestEventAt - a.latestEventAt;
  }
  if (a.latestEventAt != null) return -1;
  if (b.latestEventAt != null) return 1;
  return Date.parse(b.job.discoveredAt) - Date.parse(a.job.discoveredAt);
};

const resolveCurrentStage = (
  events: StageEvent[] | null,
): { stage: ApplicationStage; latestEventAt: number | null } => {
  const latest = events?.at(-1) ?? null;
  if (latest) {
    return { stage: latest.toStage, latestEventAt: latest.occurredAt };
  }
  return { stage: "applied", latestEventAt: null };
};

export const InProgressBoardPage: React.FC = () => {
  const [cards, setCards] = React.useState<BoardCard[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadBoard = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.getJobs({
        statuses: ["in_progress"],
        view: "list",
      });

      const jobs = response.jobs;
      const eventResults = await Promise.allSettled(
        jobs.map((job) => api.getJobStageEvents(job.id)),
      );

      const nextCards = jobs.map((job, index) => {
        const result = eventResults[index];
        const events =
          result?.status === "fulfilled"
            ? [...result.value].sort((a, b) => a.occurredAt - b.occurredAt)
            : null;
        const resolved = resolveCurrentStage(events);
        return {
          job,
          stage: resolved.stage,
          latestEventAt: resolved.latestEventAt,
        };
      });

      setCards(nextCards);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load in-progress board";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const lanes = React.useMemo(() => {
    const grouped: Record<ApplicationStage, BoardCard[]> = {
      applied: [],
      recruiter_screen: [],
      assessment: [],
      hiring_manager_screen: [],
      technical_interview: [],
      onsite: [],
      offer: [],
      closed: [],
    };

    for (const card of cards) {
      grouped[card.stage].push(card);
    }

    for (const stage of APPLICATION_STAGES) {
      grouped[stage].sort(sortByRecent);
    }

    return grouped;
  }, [cards]);

  return (
    <>
      <PageHeader
        icon={Columns3}
        title="In Progress Board"
        subtitle="Kanban view of application stages"
      />
      <PageMain className="max-w-[1600px]">
        {isLoading ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
            Loading board...
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-4">
              {APPLICATION_STAGES.map((stage) => {
                const laneCards = lanes[stage];
                return (
                  <section
                    key={stage}
                    className="w-[320px] rounded-xl border border-border/50 bg-muted/10"
                  >
                    <header className="flex items-center justify-between border-b border-border/40 px-3 py-2.5">
                      <h2 className="text-sm font-semibold tracking-wide">
                        {STAGE_LABELS[stage]}
                      </h2>
                      <Badge variant="secondary" className="tabular-nums">
                        {laneCards.length}
                      </Badge>
                    </header>

                    <div className="max-h-[calc(100vh-16rem)] space-y-2 overflow-y-auto p-3">
                      {laneCards.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border/40 p-3 text-xs text-muted-foreground">
                          No jobs
                        </div>
                      ) : (
                        laneCards.map(({ job, latestEventAt }) => (
                          <Link
                            key={job.id}
                            to={`/job/${job.id}`}
                            className={cn(
                              "block rounded-lg border border-border/40 bg-background/80 p-3 transition-colors",
                              "hover:border-border hover:bg-background",
                            )}
                          >
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div className="line-clamp-2 text-sm font-medium">
                                {job.title}
                              </div>
                              <ExternalLink className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {job.employer}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <JobStatusBadge status={job.status} />
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground/80">
                              {latestEventAt != null
                                ? `Updated ${formatTimestamp(latestEventAt)}`
                                : "No stage events yet"}
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </PageMain>
    </>
  );
};

import {
  type LogEventFormValues,
  LogEventModal,
} from "@client/components/LogEventModal";
import { PageHeader, PageMain } from "@client/components/layout";
import {
  APPLICATION_STAGES,
  type ApplicationStage,
  type JobListItem,
  STAGE_LABELS,
  type StageEvent,
} from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { ArrowDownAZ, Columns3, Plus } from "lucide-react";
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { invalidateJobData } from "@/client/hooks/queries/invalidate";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { showErrorToast } from "@/client/lib/error-toast";
import { logJobStageEvent } from "@/client/lib/logJobStageEvent";
import { queryKeys } from "@/client/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import * as api from "../api";
import { InProgressBoardCard } from "./InProgressBoardCard";

type BoardCard = {
  job: JobListItem;
  stage: ApplicationStage;
  latestEventAt: number | null;
};

type BoardStage = Exclude<ApplicationStage, "applied">;

const sortByRecent = (a: BoardCard, b: BoardCard) => {
  if (a.latestEventAt != null && b.latestEventAt != null) {
    return b.latestEventAt - a.latestEventAt;
  }
  if (a.latestEventAt != null) return -1;
  if (b.latestEventAt != null) return 1;
  return Date.parse(b.job.discoveredAt) - Date.parse(a.job.discoveredAt);
};

const sortByTitle = (a: BoardCard, b: BoardCard) =>
  a.job.title.localeCompare(b.job.title);

const sortByCompany = (a: BoardCard, b: BoardCard) =>
  a.job.employer.localeCompare(b.job.employer);

const BOARD_STAGES = APPLICATION_STAGES.filter(
  (stage) => stage !== "applied",
) as BoardStage[];

const toBoardStage = (stage: ApplicationStage): BoardStage =>
  stage === "applied" ? "recruiter_screen" : stage;

const getCardLeftAccentClass = (stage: ApplicationStage) => {
  if (stage === "technical_interview") {
    return "border-l-2 border-l-amber-400/45";
  }
  if (stage === "onsite") {
    return "border-l-2 border-l-amber-400/65";
  }
  if (stage === "offer") {
    return "border-2 border-amber-300/50 shadow-[0_4px_12px_-4px_rgba(251,191,36,0.7)]";
  }
  return "";
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
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const jobPageLinkState = React.useMemo(
    () => ({ jobPageBackTo: `${location.pathname}${location.search}` }),
    [location.pathname, location.search],
  );

  const [dragging, setDragging] = React.useState<{
    jobId: string;
    fromStage: ApplicationStage;
  } | null>(null);
  const [dropTargetStage, setDropTargetStage] =
    React.useState<ApplicationStage | null>(null);
  const [movingJobId, setMovingJobId] = React.useState<string | null>(null);
  const [sortMode, setSortMode] = React.useState<
    "updated" | "title" | "company"
  >("updated");
  const [logEventTarget, setLogEventTarget] = React.useState<{
    job: JobListItem;
    stage: ApplicationStage;
  } | null>(null);

  const boardQuery = useQuery({
    queryKey: queryKeys.jobs.inProgressBoard(),
    queryFn: async () => {
      const response = await api.getJobs({
        statuses: ["in_progress"],
        view: "list",
      });

      const jobs = response.jobs;
      const eventResults = await Promise.allSettled(
        jobs.map((job) => api.getJobStageEvents(job.id)),
      );

      return jobs.map((job, index) => {
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
    },
  });

  const transitionMutation = useMutation({
    mutationFn: ({
      jobId,
      toStage,
    }: {
      jobId: string;
      toStage: ApplicationStage;
    }) =>
      api.transitionJobStage(jobId, {
        toStage,
        metadata: {
          actor: "user",
          eventType: "status_update",
          eventLabel: `Moved to ${STAGE_LABELS[toStage]}`,
          reasonCode: "in_progress_board_drag",
        },
      }),
  });

  useQueryErrorToast(boardQuery.error, "Failed to load in-progress board");

  const cards = boardQuery.data ?? [];
  const isLoading = boardQuery.isPending;

  const lanes = React.useMemo(() => {
    const sortFn =
      sortMode === "title"
        ? sortByTitle
        : sortMode === "company"
          ? sortByCompany
          : sortByRecent;

    const grouped: Record<BoardStage, BoardCard[]> = {
      recruiter_screen: [],
      assessment: [],
      hiring_manager_screen: [],
      technical_interview: [],
      onsite: [],
      offer: [],
      closed: [],
    };

    for (const card of cards) {
      grouped[toBoardStage(card.stage)].push(card);
    }

    for (const stage of BOARD_STAGES) {
      grouped[stage].sort(sortFn);
    }

    return grouped;
  }, [cards, sortMode]);

  const handleDropToStage = React.useCallback(
    async (toStage: ApplicationStage) => {
      if (!dragging || dragging.fromStage === toStage) {
        setDropTargetStage(null);
        return;
      }

      const { jobId } = dragging;
      const previousCards =
        queryClient.getQueryData<BoardCard[]>(
          queryKeys.jobs.inProgressBoard(),
        ) ?? [];
      const nowEpoch = Math.floor(Date.now() / 1000);

      setMovingJobId(jobId);
      queryClient.setQueryData<BoardCard[]>(
        queryKeys.jobs.inProgressBoard(),
        (current) =>
          (current ?? []).map((card) =>
            card.job.id === jobId
              ? { ...card, stage: toStage, latestEventAt: nowEpoch }
              : card,
          ),
      );

      try {
        await transitionMutation.mutateAsync({ jobId, toStage });
        toast.success(`Moved to ${STAGE_LABELS[toStage]}`);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.jobs.inProgressBoard(),
        });
      } catch (error) {
        queryClient.setQueryData(
          queryKeys.jobs.inProgressBoard(),
          previousCards,
        );
        showErrorToast(error, "Failed to move stage");
      } finally {
        setMovingJobId(null);
        setDragging(null);
        setDropTargetStage(null);
      }
    },
    [dragging, queryClient, transitionMutation],
  );

  const handleBoardLogEvent = React.useCallback(
    async (values: LogEventFormValues) => {
      if (!logEventTarget) return;

      const { job, stage: currentStage } = logEventTarget;

      try {
        const { effectiveStage } = await logJobStageEvent({
          jobId: job.id,
          currentStage,
          values,
          manualStageReasonCode: "in_progress_board_menu",
        });

        await invalidateJobData(queryClient, job.id);
        setLogEventTarget(null);
        toast.success("Event logged");

        if (effectiveStage === "offer") {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#10b981", "#34d399", "#6ee7b7", "#ffffff"],
          });
        }
      } catch (error) {
        showErrorToast(error, "Failed to log event");
      }
    },
    [logEventTarget, queryClient],
  );

  return (
    <>
      <PageHeader
        icon={Columns3}
        title="In Progress Board"
        subtitle="Kanban view of application stages"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select
              value={sortMode}
              onValueChange={(value) =>
                setSortMode(value as "updated" | "title" | "company")
              }
            >
              <SelectTrigger className="h-8 w-[132px] text-xs">
                <ArrowDownAZ className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Recent</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => navigate("/jobs/ready")}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        }
      />
      <PageMain className="flex h-[calc(100dvh-5rem)] max-w-[1600px] flex-col">
        {isLoading ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
            Loading board...
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-x-auto pb-2">
            <div className="flex h-full min-w-max items-stretch gap-4">
              {BOARD_STAGES.map((stage) => {
                const laneCards = lanes[stage];
                return (
                  <section
                    key={stage}
                    aria-label={`${STAGE_LABELS[stage]} lane`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!dragging || dragging.fromStage === stage) return;
                      setDropTargetStage(stage);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      void handleDropToStage(stage);
                    }}
                    onDragLeave={() => {
                      if (dropTargetStage === stage) {
                        setDropTargetStage(null);
                      }
                    }}
                    className={cn(
                      "flex h-full w-[320px] flex-col rounded-xl border border-border/70 bg-muted/30 shadow-[0_10px_24px_-20px_rgba(0,0,0,0.8)] transition-colors",
                      dropTargetStage === stage &&
                        "border-sky-400/70 bg-sky-500/15",
                    )}
                  >
                    <header
                      className={
                        "flex items-center justify-between border-b border-border/60 px-3 py-2.5"
                      }
                    >
                      <h2 className="text-xs font-semibold tracking-[0.03em] text-foreground/90 uppercase">
                        {STAGE_LABELS[stage]}
                      </h2>
                      <Badge
                        variant="outline"
                        className="tabular-nums border-border/50 bg-transparent text-foreground/70"
                      >
                        {laneCards.length}
                      </Badge>
                    </header>

                    <div
                      className={cn(
                        "min-h-0 flex-1 space-y-2 p-2.5 [scrollbar-gutter:stable]",
                        dragging ? "overflow-hidden" : "overflow-y-auto",
                      )}
                    >
                      {laneCards.length === 0 ? (
                        <div className="rounded-md border border-dashed border-border/35 bg-background/20 px-2.5 py-2 text-[11px] text-muted-foreground/80">
                          Drop a card here or log a stage.
                        </div>
                      ) : (
                        laneCards.map(({ job, latestEventAt, stage }) => (
                          <InProgressBoardCard
                            key={job.id}
                            job={job}
                            stage={stage}
                            latestEventAt={latestEventAt}
                            jobPageLinkState={jobPageLinkState}
                            isMoving={movingJobId === job.id}
                            cardClassName={getCardLeftAccentClass(stage)}
                            onDragStart={(event) => {
                              if (
                                (event.target as HTMLElement).closest(
                                  "[data-board-card-menu]",
                                )
                              ) {
                                event.preventDefault();
                                return;
                              }
                              setDragging({ jobId: job.id, fromStage: stage });
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDragging(null);
                              setDropTargetStage(null);
                            }}
                            onLogEvent={() => setLogEventTarget({ job, stage })}
                          />
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

      <LogEventModal
        isOpen={logEventTarget != null}
        onClose={() => setLogEventTarget(null)}
        onLog={handleBoardLogEvent}
        jobTitle={logEventTarget?.job.title}
        employer={logEventTarget?.job.employer}
      />
    </>
  );
};

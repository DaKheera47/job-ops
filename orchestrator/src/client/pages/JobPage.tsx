import {
  type ApplicationStage,
  type ApplicationTask,
  type Job,
  type JobOutcome,
  STAGE_LABELS,
  type StageEvent,
} from "@shared/types.js";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  DollarSign,
  PanelRightOpen,
  PlusCircle,
} from "lucide-react";
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatTimestamp } from "@/lib/utils";
import * as api from "../api";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { GhostwriterPanel } from "../components/ghostwriter/GhostwriterPanel";
import { JobHeader } from "../components/JobHeader";
import {
  type LogEventFormValues,
  LogEventModal,
} from "../components/LogEventModal";
import { JobTimeline } from "./job/Timeline";

export const JobPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = React.useState<Job | null>(null);
  const [events, setEvents] = React.useState<StageEvent[]>([]);
  const [tasks, setTasks] = React.useState<ApplicationTask[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLogModalOpen, setIsLogModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isGhostwriterOpen, setIsGhostwriterOpen] = React.useState(false);
  const [eventToDelete, setEventToDelete] = React.useState<string | null>(null);
  const [editingEvent, setEditingEvent] = React.useState<StageEvent | null>(
    null,
  );
  const pendingEventRef = React.useRef<StageEvent | null>(null);

  const loadData = React.useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const jobData = await api.getJob(id);
      setJob(jobData);

      api
        .getJobStageEvents(id)
        .then((data) => setEvents(mergeEvents(data, pendingEventRef.current)))
        .catch(() => toast.error("Failed to load stage events"));

      api
        .getJobTasks(id)
        .then((data) => setTasks(data))
        .catch(() => toast.error("Failed to load tasks"));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogEvent = async (
    values: LogEventFormValues,
    eventId?: string,
  ) => {
    if (!job) return;
    if (job.status !== "in_progress") {
      toast.error("Move this job to In Progress to track stages.");
      return;
    }

    let toStage: ApplicationStage | "no_change" = values.stage as
      | ApplicationStage
      | "no_change";
    let outcome: JobOutcome | null = null;

    if (values.stage === "rejected") {
      toStage = "closed";
      outcome = "rejected";
    } else if (values.stage === "withdrawn") {
      toStage = "closed";
      outcome = "withdrawn";
    }

    const currentStage = events.at(-1)?.toStage ?? "applied";
    const effectiveStage =
      toStage === "no_change" ? (currentStage ?? "applied") : toStage;

    try {
      if (eventId) {
        await api.updateJobStageEvent(job.id, eventId, {
          toStage: toStage === "no_change" ? undefined : toStage,
          occurredAt: toTimestamp(values.date) ?? undefined,
          metadata: {
            note: values.notes?.trim() || undefined,
            eventLabel: values.title.trim() || undefined,
            reasonCode: values.reasonCode || undefined,
            actor: "user",
            eventType: values.stage === "no_change" ? "note" : "status_update",
            externalUrl: values.salary ? `Salary: ${values.salary}` : undefined,
          },
          outcome,
        });
      } else {
        const newEvent = await api.transitionJobStage(job.id, {
          toStage: effectiveStage,
          occurredAt: toTimestamp(values.date),
          metadata: {
            note: values.notes?.trim() || undefined,
            eventLabel: values.title.trim() || undefined,
            reasonCode: values.reasonCode || undefined,
            actor: "user",
            eventType: values.stage === "no_change" ? "note" : "status_update",
            externalUrl: values.salary ? `Salary: ${values.salary}` : undefined,
          },
          outcome,
        });
        pendingEventRef.current = newEvent;
      }

      const [jobData, eventData] = await Promise.all([
        api.getJob(job.id),
        api.getJobStageEvents(job.id),
      ]);
      setJob(jobData);
      setEvents(eventData);
      pendingEventRef.current = null;
      setEditingEvent(null);
      toast.success(eventId ? "Event updated" : "Event logged");

      if (effectiveStage === "offer") {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#10b981", "#34d399", "#6ee7b7", "#ffffff"],
        });
      }
    } catch (error) {
      console.error("Failed to log event:", error);
      toast.error("Failed to log event");
    }
  };

  const confirmDeleteEvent = (eventId: string) => {
    setEventToDelete(eventId);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteEvent = async () => {
    if (!job || !eventToDelete) return;
    try {
      await api.deleteJobStageEvent(job.id, eventToDelete);
      const [jobData, eventData] = await Promise.all([
        api.getJob(job.id),
        api.getJobStageEvents(job.id),
      ]);
      setJob(jobData);
      setEvents(eventData);
      toast.success("Event deleted");
    } catch (error) {
      console.error("Failed to delete event:", error);
      toast.error("Failed to delete event");
    } finally {
      setIsDeleteModalOpen(false);
      setEventToDelete(null);
    }
  };

  const handleEditEvent = (event: StageEvent) => {
    setEditingEvent(event);
    setIsLogModalOpen(true);
  };

  const currentStage = job
    ? (events.at(-1)?.toStage ??
      (job.status === "applied" || job.status === "in_progress"
        ? "applied"
        : null))
    : null;
  const canTrackStages = job?.status === "in_progress";

  if (!id) {
    return null;
  }

  return (
    <main className="container mx-auto max-w-6xl space-y-6 px-4 py-6 pb-12">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setIsLogModalOpen(true)}
            disabled={!job || !canTrackStages}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Log Event
          </Button>
        </div>
      </div>

      {job ? (
        <JobHeader
          job={job}
          className="rounded-lg border border-border/40 bg-muted/5 p-4"
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-sm text-muted-foreground">
          {isLoading ? "Loading application..." : "Application not found."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" />
                Stage timeline
              </CardTitle>
              <div className="flex items-center gap-2">
                {job?.salary && (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    <DollarSign className="mr-1 h-3.5 w-3.5" />
                    {job.salary}
                  </Badge>
                )}
                {currentStage && (
                  <Badge
                    variant="secondary"
                    className="px-3 py-1 text-xs font-medium uppercase tracking-wider"
                  >
                    {STAGE_LABELS[currentStage as ApplicationStage] ||
                      currentStage}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!canTrackStages && (
              <div className="mb-4 rounded-md border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
                Move this job to In Progress to track application stages.
              </div>
            )}
            <JobTimeline
              events={events}
              onEdit={canTrackStages ? handleEditEvent : undefined}
              onDelete={canTrackStages ? confirmDeleteEvent : undefined}
            />
          </CardContent>
        </Card>

        <Sheet open={isGhostwriterOpen} onOpenChange={setIsGhostwriterOpen}>
          <div className="space-y-4">
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarClock className="h-4 w-4" />
                    Application details
                  </CardTitle>
                  <SheetTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      disabled={!job}
                    >
                      <PanelRightOpen className="h-3.5 w-3.5" />
                      Ghostwriter
                    </Button>
                  </SheetTrigger>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Current Stage
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {currentStage
                      ? STAGE_LABELS[currentStage as ApplicationStage] ||
                        currentStage
                      : job?.status}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Outcome
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {job?.outcome ? job.outcome.replace(/_/g, " ") : "Open"}
                  </div>
                </div>
                {job?.closedAt && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Closed On
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {formatTimestamp(job.closedAt)}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {tasks.length > 0 && (
              <Card className="border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarClock className="h-4 w-4" />
                    Upcoming tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-foreground/90">
                            {task.title}
                          </div>
                          {task.notes && (
                            <div className="text-xs text-muted-foreground">
                              {task.notes}
                            </div>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase tracking-wide"
                        >
                          {formatTimestamp(task.dueDate)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <SheetContent
              side="right"
              className="w-full p-0 sm:max-w-none lg:w-[40vw]"
            >
              <div className="h-full overflow-y-auto p-4">
                <SheetHeader>
                  <SheetTitle>Ghostwriter</SheetTitle>
                  <SheetDescription>
                    Chat with context from this job and your writing style.
                  </SheetDescription>
                </SheetHeader>
                {job && (
                  <div className="mt-4">
                    <GhostwriterPanel job={job} />
                  </div>
                )}
              </div>
            </SheetContent>
          </div>
        </Sheet>
      </div>

      <LogEventModal
        isOpen={isLogModalOpen}
        onClose={() => {
          setIsLogModalOpen(false);
          setEditingEvent(null);
        }}
        onLog={handleLogEvent}
        editingEvent={editingEvent}
      />

      <ConfirmDelete
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setEventToDelete(null);
        }}
        onConfirm={handleDeleteEvent}
      />
    </main>
  );
};

const toTimestamp = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
};

const mergeEvents = (events: StageEvent[], pending: StageEvent | null) => {
  if (!pending) return events;
  if (events.some((event) => event.id === pending.id)) return events;
  return [...events, pending].sort((a, b) => a.occurredAt - b.occurredAt);
};

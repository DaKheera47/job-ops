import React from "react";
import { ArrowLeft, CalendarClock, ClipboardList, LogIn } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { JobHeader } from "../components/JobHeader";
import { JobTimeline } from "./job/Timeline";
import * as api from "../api";
import type { ApplicationStage, ApplicationTask, Job, JobOutcome, StageEvent } from "../../shared/types";
import { APPLICATION_OUTCOMES } from "../../shared/types";

const taskLabels: Record<string, string> = {
  follow_up: "Follow up",
  send_docs: "Send documents",
  prep_interview: "Prep interview",
  custom: "Task",
};

const formatTimestamp = (value?: number | null) => {
  if (!value) return "No due date";
  return new Date(value * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const JobPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = React.useState<Job | null>(null);
  const [events, setEvents] = React.useState<StageEvent[]>([]);
  const [tasks, setTasks] = React.useState<ApplicationTask[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isOutcomeOpen, setIsOutcomeOpen] = React.useState(false);
  const [isSavingOutcome, setIsSavingOutcome] = React.useState(false);
  const [selectedOutcome, setSelectedOutcome] = React.useState<JobOutcome | "none">("none");
  const [selectedAction, setSelectedAction] = React.useState<ActionConfig | null>(null);
  const [eventTitle, setEventTitle] = React.useState("");
  const [eventNotes, setEventNotes] = React.useState("");
  const [eventDate, setEventDate] = React.useState("");
  const [reasonCode, setReasonCode] = React.useState<string | null>(null);
  const [isLoggingEvent, setIsLoggingEvent] = React.useState(false);
  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const pendingEventRef = React.useRef<StageEvent | null>(null);

  const loadData = React.useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [jobData, eventData, taskData] = await Promise.all([
        api.getJob(id),
        api.getJobStageEvents(id),
        api.getJobTasks(id),
      ]);
      setJob(jobData);
      setEvents(mergeEvents(eventData, pendingEventRef.current));
      setTasks(taskData);
      setSelectedOutcome(jobData.outcome ?? "none");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenOutcome = () => {
    setSelectedOutcome(job?.outcome ?? "none");
    setIsOutcomeOpen(true);
  };

  const handleSaveOutcome = async () => {
    if (!job) return;
    setIsSavingOutcome(true);
    try {
      const outcomeValue = selectedOutcome === "none" ? null : selectedOutcome;
      const updated = await api.updateJobOutcome(job.id, {
        outcome: outcomeValue,
        closedAt: outcomeValue ? Math.floor(Date.now() / 1000) : null,
      });
      setJob(updated);
      setIsOutcomeOpen(false);
    } finally {
      setIsSavingOutcome(false);
    }
  };

  const handleOpenAction = (action: ActionConfig) => {
    setSelectedAction(action);
    setEventTitle(action.defaultTitle);
    setEventNotes("");
    setReasonCode(null);
    setEventDate(toDateTimeLocal(new Date()));
  };

  const handleLogEvent = async () => {
    if (!job || !selectedAction) return;
    setIsLoggingEvent(true);
    try {
      const newEvent = await api.transitionJobStage(job.id, {
        toStage: selectedAction.toStage,
        occurredAt: toTimestamp(eventDate),
        metadata: {
          note: eventNotes.trim() || undefined,
          groupId: selectedAction.groupLabel ? toGroupId(selectedAction.groupLabel) : undefined,
          groupLabel: selectedAction.groupLabel || undefined,
          eventLabel: eventTitle.trim() || undefined,
          reasonCode: reasonCode || undefined,
          actor: "user",
        },
      });
      pendingEventRef.current = newEvent;
      setEvents((prev) =>
        [...prev, newEvent].sort((a, b) => a.occurredAt - b.occurredAt),
      );
      const [jobData, eventData, taskData] = await Promise.all([
        api.getJob(job.id),
        api.getJobStageEvents(job.id),
        api.getJobTasks(job.id),
      ]);
      setJob(jobData);
      setEvents(mergeEvents(eventData, newEvent));
      setTasks(taskData);
      pendingEventRef.current = null;
      setSelectedAction(null);
    } finally {
      setIsLoggingEvent(false);
    }
  };

  React.useEffect(() => {
    if (!selectedAction) return;
    requestAnimationFrame(() => {
      dateInputRef.current?.focus();
    });
  }, [selectedAction]);

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
        <div className="text-xs text-muted-foreground">
          Application tracking
        </div>
      </div>

      {job ? (
        <JobHeader job={job} className="rounded-lg border border-border/40 bg-muted/5 p-4" />
      ) : (
        <div className="rounded-lg border border-dashed border-border/40 p-6 text-sm text-muted-foreground">
          {isLoading ? "Loading application..." : "Application not found."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" />
              Stage timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JobTimeline events={events} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LogIn className="h-4 w-4" />
                Next stage actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {job ? (
                <ActionBar job={job} events={events} onAction={handleOpenAction} />
              ) : (
                <div className="text-sm text-muted-foreground">Load a job to see actions.</div>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" />
                Next actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="text-sm text-muted-foreground">No upcoming tasks.</div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-foreground/90">
                          {taskLabels[task.type] ?? task.type}
                        </div>
                        {task.notes && (
                          <div className="text-xs text-muted-foreground">{task.notes}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {formatTimestamp(task.dueDate)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Outcome</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {job?.outcome ? `Outcome: ${job.outcome.replace(/_/g, " ")}` : "Open"}
              </div>
              <div className="text-xs text-muted-foreground">
                {job?.closedAt ? `Closed: ${formatTimestamp(job.closedAt)}` : "Not closed"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/70 text-destructive hover:text-destructive hover:border-destructive"
                  onClick={() =>
                    handleOpenAction({
                      id: "rejected",
                      label: "Rejected",
                      toStage: "rejected",
                      defaultTitle: "Rejected",
                      modalTitle: "Mark as rejected",
                      modalDescription: "Capture the rejection and a reason if known.",
                      variant: "secondary",
                      reasonCodes: ["Skills", "Visa", "Timing", "Unknown"],
                    })
                  }
                >
                  Rejected
                </Button>
                <Button size="sm" variant="outline" onClick={handleOpenOutcome}>
                  Update outcome
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={isOutcomeOpen} onOpenChange={setIsOutcomeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close out this application</AlertDialogTitle>
            <AlertDialogDescription>
              Set an outcome to mark the application as closed. Clearing the outcome keeps it open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Select
              value={selectedOutcome}
              onValueChange={(value) => setSelectedOutcome(value as JobOutcome | "none")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keep open</SelectItem>
                {APPLICATION_OUTCOMES.map((outcome) => (
                  <SelectItem key={outcome} value={outcome}>
                    {outcome.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={handleSaveOutcome} disabled={isSavingOutcome}>
                {isSavingOutcome ? "Saving..." : "Save outcome"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(selectedAction)} onOpenChange={(open) => !open && setSelectedAction(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedAction?.modalTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedAction?.modalDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Title</div>
              <Input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Date</div>
              <Input
                ref={dateInputRef}
                type="datetime-local"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Notes</div>
              <Textarea
                value={eventNotes}
                onChange={(event) => setEventNotes(event.target.value)}
                placeholder="Add quick context"
              />
            </div>
            {selectedAction?.reasonCodes && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Reason</div>
                <div className="flex flex-wrap gap-2">
                  {selectedAction.reasonCodes.map((code) => (
                    <Button
                      key={code}
                      type="button"
                      variant={reasonCode === code ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReasonCode(code)}
                    >
                      {code}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={handleLogEvent} disabled={isLoggingEvent || !eventDate}>
                {isLoggingEvent ? "Logging..." : "Confirm"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

interface ActionConfig {
  id: string;
  label: string;
  toStage: ApplicationStage;
  defaultTitle: string;
  modalTitle: string;
  modalDescription: string;
  groupLabel?: string;
  variant: "primary" | "secondary";
  reasonCodes?: string[];
}

const ACTIONS_BY_STAGE: Record<string, ActionConfig[]> = {
  applied: [
    {
      id: "book-recruiter-screen",
      label: "Recruiter Screen",
      toStage: "recruiter_screen",
      defaultTitle: "Recruiter Screen",
      modalTitle: "Book recruiter screen",
      modalDescription: "Log when the recruiter screen is scheduled.",
      variant: "primary",
    },
    {
      id: "log-assessment",
      label: "Online Assessment Received",
      toStage: "assessment",
      defaultTitle: "Assessment Received",
      modalTitle: "Assessment received",
      modalDescription: "Track the online assessment or take-home.",
      variant: "primary",
      groupLabel: "Online assessment",
    },
    {
      id: "rejected",
      label: "Rejected",
      toStage: "rejected",
      defaultTitle: "Rejected",
      modalTitle: "Mark as rejected",
      modalDescription: "Capture the rejection and a reason if known.",
      variant: "secondary",
      reasonCodes: ["Skills", "Visa", "Timing", "Unknown"],
    },
  ],
  assessment: [
    {
      id: "oa-submitted",
      label: "Log OA Submitted",
      toStage: "assessment",
      defaultTitle: "OA Submitted",
      modalTitle: "OA submitted",
      modalDescription: "Log submission of the assessment.",
      variant: "primary",
      groupLabel: "Online assessment",
    },
    {
      id: "pass-interview",
      label: "Pass to Interview",
      toStage: "interview",
      defaultTitle: "Interview Stage",
      modalTitle: "Advance to interviews",
      modalDescription: "Move into the interview stage.",
      variant: "primary",
    },
    {
      id: "rejected",
      label: "Rejected",
      toStage: "rejected",
      defaultTitle: "Rejected",
      modalTitle: "Mark as rejected",
      modalDescription: "Capture the rejection and a reason if known.",
      variant: "secondary",
      reasonCodes: ["Skills", "Visa", "Timing", "Unknown"],
    },
  ],
  interview: [
    {
      id: "next-round",
      label: "Log Next Round",
      toStage: "interview",
      defaultTitle: "Next Round",
      modalTitle: "Log next round",
      modalDescription: "Track the next interview round.",
      variant: "primary",
    },
    {
      id: "log-offer",
      label: "Log Offer",
      toStage: "offer",
      defaultTitle: "Offer Received",
      modalTitle: "Log the offer",
      modalDescription: "Capture the offer stage.",
      variant: "primary",
    },
    {
      id: "rejected",
      label: "Rejected",
      toStage: "rejected",
      defaultTitle: "Rejected",
      modalTitle: "Mark as rejected",
      modalDescription: "Capture the rejection and a reason if known.",
      variant: "secondary",
      reasonCodes: ["Skills", "Visa", "Timing", "Unknown"],
    },
    {
      id: "withdrawn",
      label: "Withdrawn",
      toStage: "withdrawn",
      defaultTitle: "Withdrawn",
      modalTitle: "Withdraw application",
      modalDescription: "Log that you withdrew from the process.",
      variant: "secondary",
    },
  ],
};

const ACTIONS_NO_EVENTS: ActionConfig[] = [
  {
    id: "log-applied",
    label: "Log Applied",
    toStage: "applied",
    defaultTitle: "Applied",
    modalTitle: "Log application",
    modalDescription: "Mark when you submitted the application.",
    variant: "primary",
  },
  {
    id: "rejected",
    label: "Rejected",
    toStage: "rejected",
    defaultTitle: "Rejected",
    modalTitle: "Mark as rejected",
    modalDescription: "Capture the rejection and a reason if known.",
    variant: "secondary",
    reasonCodes: ["Skills", "Visa", "Timing", "Unknown"],
  },
  {
    id: "withdrawn",
    label: "Withdrawn",
    toStage: "withdrawn",
    defaultTitle: "Withdrawn",
    modalTitle: "Withdraw application",
    modalDescription: "Log that you withdrew from the process.",
    variant: "secondary",
  },
];

const ActionBar: React.FC<{
  job: Job;
  events: StageEvent[];
  onAction: (action: ActionConfig) => void;
}> = ({ job, events, onAction }) => {
  const hasEvents = events.length > 0;
  const lastEvent = events.at(-1);
  const currentStage = lastEvent?.toStage ?? (job.status === "applied" ? "applied" : null);
  const stageKey = normalizeStageKey(currentStage);
  const actions = hasEvents
    ? (stageKey ? ACTIONS_BY_STAGE[stageKey] ?? [] : [])
    : ACTIONS_NO_EVENTS;

  if (actions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No stage actions available for the current status.
      </div>
    );
  }

  const logActions = actions.filter((action) => action.variant === "primary");

  return (
    <div className="space-y-3">
      {!hasEvents && (
        <div className="text-xs text-muted-foreground">
          Start tracking by logging the first milestone.
        </div>
      )}
      {logActions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Log</div>
          <div className="flex flex-wrap gap-2">
            {logActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                className="border-border/60 text-muted-foreground hover:text-foreground"
                onClick={() => onAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const normalizeStageKey = (stage: ApplicationStage | null) => {
  if (!stage) return null;
  if (stage === "assessment") return "assessment";
  if (stage === "interview") return "interview";
  if (stage === "recruiter_screen") return "applied";
  if (stage === "applied") return "applied";
  return null;
};

const toGroupId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const toDateTimeLocal = (value: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(
    value.getMinutes(),
  )}`;
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

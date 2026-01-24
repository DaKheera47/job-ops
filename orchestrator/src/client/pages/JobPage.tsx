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
  prep: "Prep",
  todo: "Todo",
  follow_up: "Follow up",
  check_status: "Check status",
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
  const [showArchivePrompt, setShowArchivePrompt] = React.useState(false);
  const dateInputRef = React.useRef<HTMLInputElement>(null);
  const pendingEventRef = React.useRef<StageEvent | null>(null);

  const loadData = React.useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const jobData = await api.getJob(id);
      setJob(jobData);
      setSelectedOutcome(jobData.outcome ?? "none");

      // Load events and tasks separately so failure doesn't block the job header
      api.getJobStageEvents(id)
        .then((data) => setEvents(mergeEvents(data, pendingEventRef.current)))
        .catch(() => null);

      api.getJobTasks(id)
        .then((data) => setTasks(data))
        .catch(() => null);
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
    setEventTitle(action.defaultTitle ?? "");
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
          eventType: selectedAction.eventType ?? undefined,
          actor: "user",
        },
        outcome: selectedAction.outcome,
        actionId: selectedAction.id,
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
      if (selectedAction.id === "accept_offer") {
        setShowArchivePrompt(true);
      }
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
                          {task.title || taskLabels[task.type] || task.type}
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
                      id: "mark_rejected",
                      label: "Rejected",
                      toStage: "closed",
                      defaultTitle: "Rejected",
                      modalTitle: "Mark as rejected",
                      modalDescription: "Capture the rejection and a reason if known.",
                      tone: "negative",
                      outcome: "rejected",
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
            {selectedAction?.allowTitleInput ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Title</div>
                <Input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
              </div>
            ) : (
              selectedAction?.defaultTitle && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Title</div>
                  <div className="text-sm text-foreground/80">{selectedAction.defaultTitle}</div>
                </div>
              )
            )}
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

      <AlertDialog open={showArchivePrompt} onOpenChange={setShowArchivePrompt}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive other applications?</AlertDialogTitle>
            <AlertDialogDescription>
              You accepted an offer. Would you like to archive the rest of your active applications?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={() => setShowArchivePrompt(false)}>Got it</Button>
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
  defaultTitle?: string;
  modalTitle: string;
  modalDescription: string;
  groupLabel?: string;
  tone: "primary" | "secondary" | "negative";
  reasonCodes?: string[];
  eventType?: "interview_log" | "status_update" | "note";
  outcome?: JobOutcome | null;
  allowTitleInput?: boolean;
}

const ACTIONS_BY_STAGE: Record<ApplicationStage, ActionConfig[]> = {
  applied: [
    {
      id: "book_recruiter_screen",
      label: "Book Recruiter Screen",
      toStage: "recruiter_screen",
      defaultTitle: "Recruiter Screen",
      modalTitle: "Book recruiter screen",
      modalDescription: "Log when the recruiter screen is scheduled.",
      tone: "primary",
    },
    {
      id: "log_oa_received",
      label: "Log OA Received",
      toStage: "assessment",
      defaultTitle: "Online Assessment Received",
      modalTitle: "Online assessment received",
      modalDescription: "Track the online assessment or take-home.",
      tone: "primary",
      groupLabel: "Online assessment",
    },
    {
      id: "direct_to_interview",
      label: "Direct to Interview",
      toStage: "technical_interview",
      defaultTitle: "Technical Interview Invite",
      modalTitle: "Direct to interview",
      modalDescription: "Log the technical interview invite.",
      tone: "primary",
    },
    {
      id: "mark_rejected",
      label: "Rejected",
      toStage: "closed",
      defaultTitle: "Rejected",
      modalTitle: "Mark as rejected",
      modalDescription: "Capture the rejection and a reason if known.",
      tone: "negative",
      outcome: "rejected",
      reasonCodes: ["Skills", "Visa", "Timing", "Unknown"],
    },
  ],
  recruiter_screen: [
    {
      id: "log_screen_completed",
      label: "Log Screen Completed",
      toStage: "recruiter_screen",
      defaultTitle: "Screen Completed",
      modalTitle: "Recruiter screen completed",
      modalDescription: "Log completion of the recruiter screen.",
      tone: "primary",
      eventType: "interview_log",
    },
    {
      id: "pass_to_hm",
      label: "Pass to HM Screen",
      toStage: "hiring_manager_screen",
      defaultTitle: "Moved to HM Screen",
      modalTitle: "Move to hiring manager screen",
      modalDescription: "Advance to the hiring manager screen.",
      tone: "primary",
    },
    {
      id: "pass_to_technical",
      label: "Pass to Technical",
      toStage: "technical_interview",
      defaultTitle: "Moved to Technical Round",
      modalTitle: "Move to technical round",
      modalDescription: "Advance to the technical interview stage.",
      tone: "primary",
    },
    {
      id: "mark_rejected",
      label: "Rejected",
      toStage: "closed",
      defaultTitle: "Rejected",
      modalTitle: "Mark as rejected",
      modalDescription: "Capture the rejection and a reason if known.",
      tone: "negative",
      outcome: "rejected",
      reasonCodes: ["Skills", "Visa", "Timing", "Unknown"],
    },
  ],
  assessment: [
    {
      id: "log_oa_started",
      label: "Log OA Started",
      toStage: "assessment",
      defaultTitle: "Started Assessment",
      modalTitle: "Assessment started",
      modalDescription: "Track when you started the assessment.",
      tone: "primary",
      eventType: "status_update",
      groupLabel: "Online assessment",
    },
    {
      id: "log_oa_submitted",
      label: "Log OA Submitted",
      toStage: "assessment",
      defaultTitle: "Submitted Assessment",
      modalTitle: "Assessment submitted",
      modalDescription: "Log submission of the assessment.",
      tone: "primary",
      eventType: "status_update",
      groupLabel: "Online assessment",
    },
    {
      id: "pass_to_interview",
      label: "Pass to Interview",
      toStage: "technical_interview",
      defaultTitle: "Passed Assessment",
      modalTitle: "Advance to interviews",
      modalDescription: "Move into the technical interview stage.",
      tone: "primary",
    },
    {
      id: "fail_assessment",
      label: "Rejected",
      toStage: "closed",
      defaultTitle: "Rejected",
      modalTitle: "Mark as rejected",
      modalDescription: "Capture the rejection and a reason if known.",
      tone: "negative",
      outcome: "rejected",
      reasonCodes: ["Skills", "Visa", "Timing", "Unknown"],
    },
  ],
  hiring_manager_screen: [],
  technical_interview: [],
  onsite: [],
  offer: [
    {
      id: "accept_offer",
      label: "Accept Offer",
      toStage: "closed",
      defaultTitle: "Offer Accepted",
      modalTitle: "Accept offer",
      modalDescription: "Log acceptance and close the application. You'll be prompted to archive other applications.",
      tone: "primary",
      outcome: "offer_accepted",
    },
    {
      id: "decline_offer",
      label: "Decline Offer",
      toStage: "closed",
      defaultTitle: "Offer Declined",
      modalTitle: "Decline offer",
      modalDescription: "Log that you declined the offer.",
      tone: "secondary",
      outcome: "offer_declined",
    },
    {
      id: "withdraw_application",
      label: "Withdraw",
      toStage: "closed",
      defaultTitle: "Withdrawn",
      modalTitle: "Withdraw application",
      modalDescription: "Log that you withdrew from the process.",
      tone: "secondary",
      outcome: "withdrawn",
    },
  ],
  closed: [],
};

const INTERVIEW_STAGE_ACTIONS: ActionConfig[] = [
  {
    id: "book_interview_round",
    label: "Book Interview Round",
    toStage: "technical_interview",
    defaultTitle: "Technical Round",
    modalTitle: "Book interview round",
    modalDescription: "Log the next interview round.",
    tone: "primary",
    eventType: "interview_log",
  },
  {
    id: "log_feedback",
    label: "Log Feedback",
    toStage: "technical_interview",
    defaultTitle: "Interview Notes",
    modalTitle: "Interview notes",
    modalDescription: "Capture notes without changing the stage.",
    tone: "secondary",
    eventType: "note",
  },
  {
    id: "pass_to_onsite",
    label: "Pass to Onsite",
    toStage: "onsite",
    defaultTitle: "Invited to Onsite",
    modalTitle: "Move to onsite",
    modalDescription: "Advance to onsite interviews.",
    tone: "primary",
  },
  {
    id: "offer_received",
    label: "Offer Received",
    toStage: "offer",
    defaultTitle: "Offer Extended",
    modalTitle: "Offer extended",
    modalDescription: "Log the offer stage.",
    tone: "primary",
  },
];

const GLOBAL_ACTIONS: ActionConfig[] = [
  {
    id: "mark_ghosted",
    label: "Mark Ghosted",
    toStage: "closed",
    defaultTitle: "Ghosted",
    modalTitle: "Mark as ghosted",
    modalDescription: "Close out after no response.",
    tone: "negative",
    outcome: "ghosted",
  },
  {
    id: "log_ad_hoc_note",
    label: "Log Note",
    toStage: "applied",
    modalTitle: "Log a note",
    modalDescription: "Add an ad-hoc note to the timeline.",
    tone: "secondary",
    eventType: "note",
    allowTitleInput: true,
  },
];

const ActionBar: React.FC<{
  job: Job;
  events: StageEvent[];
  onAction: (action: ActionConfig) => void;
}> = ({ job, events, onAction }) => {
  const lastEvent = events.at(-1);
  const currentStage = getCurrentStage(job, lastEvent);
  const stageActions = currentStage ? getAvailableActions(currentStage) : [];
  const actions = [
    ...stageActions,
    ...GLOBAL_ACTIONS.map((action) =>
      action.id === "log_ad_hoc_note"
        ? { ...action, toStage: currentStage ?? action.toStage }
        : action,
    ),
  ];

  if (actions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No stage actions available for the current status.
      </div>
    );
  }

  const primaryActions = actions.filter((action) => action.tone === "primary");
  const secondaryActions = actions.filter((action) => action.tone === "secondary");
  const negativeActions = actions.filter((action) => action.tone === "negative");

  return (
    <div className="space-y-3">
      {primaryActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {primaryActions.map((action) => (
            <Button key={action.id} onClick={() => onAction(action)}>
              {action.label}
            </Button>
          ))}
        </div>
      )}
      {secondaryActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {secondaryActions.map((action) => (
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
      )}
      {negativeActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {negativeActions.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              className="border-destructive/70 text-destructive hover:text-destructive hover:border-destructive"
              onClick={() => onAction(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

const getCurrentStage = (job: Job, lastEvent?: StageEvent) => {
  if (lastEvent?.toStage) return lastEvent.toStage;
  if (job.status === "applied") return "applied" as ApplicationStage;
  return null;
};

const getAvailableActions = (stage: ApplicationStage): ActionConfig[] => {
  if (stage === "hiring_manager_screen" || stage === "technical_interview" || stage === "onsite") {
    return INTERVIEW_STAGE_ACTIONS.map((action) => {
      if (action.id === "book_interview_round" || action.id === "log_feedback") {
        return { ...action, toStage: stage };
      }
      return action;
    });
  }
  return ACTIONS_BY_STAGE[stage] ?? [];
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

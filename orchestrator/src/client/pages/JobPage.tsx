import React from "react";
import { ArrowLeft, CalendarClock, ClipboardList } from "lucide-react";
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
import { JobHeader } from "../components/JobHeader";
import { JobTimeline } from "./job/Timeline";
import * as api from "../api";
import type { ApplicationTask, Job, JobOutcome, StageEvent } from "../../shared/types";
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
      setEvents(eventData);
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
              <Button size="sm" variant="outline" onClick={handleOpenOutcome}>
                Update outcome
              </Button>
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
    </main>
  );
};

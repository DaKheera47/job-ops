import type { LogEventFormValues } from "@client/components/LogEventModal";
import type {
  ApplicationStage,
  JobOutcome,
  StageEvent,
} from "@shared/types.js";
import * as api from "../api";

export type LogJobStageEventReasonCode =
  | "job_page_manual_stage"
  | "in_progress_board_menu";

export type LogJobStageEventParams = {
  jobId: string;
  currentStage: ApplicationStage;
  values: LogEventFormValues;
  eventId?: string;
  manualStageReasonCode?: LogJobStageEventReasonCode;
};

export type LogJobStageEventResult = {
  effectiveStage: ApplicationStage;
  newEvent: StageEvent | null;
};

const toTimestamp = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
};

export async function logJobStageEvent({
  jobId,
  currentStage,
  values,
  eventId,
  manualStageReasonCode = "job_page_manual_stage",
}: LogJobStageEventParams): Promise<LogJobStageEventResult> {
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

  const effectiveStage = toStage === "no_change" ? currentStage : toStage;

  const metadata = {
    note: values.notes?.trim() || undefined,
    eventLabel: values.title.trim() || undefined,
    reasonCode:
      values.reasonCode ||
      (values.stage === "no_change" ? undefined : manualStageReasonCode),
    actor: "user" as const,
    eventType:
      values.stage === "no_change"
        ? ("note" as const)
        : ("status_update" as const),
    externalUrl: values.salary ? `Salary: ${values.salary}` : undefined,
  };

  if (eventId) {
    await api.updateJobStageEvent(jobId, eventId, {
      toStage: toStage === "no_change" ? undefined : toStage,
      occurredAt: toTimestamp(values.date) ?? undefined,
      metadata,
      outcome,
    });
    return { effectiveStage, newEvent: null };
  }

  const newEvent = await api.transitionJobStage(jobId, {
    toStage: effectiveStage,
    occurredAt: toTimestamp(values.date),
    metadata,
    outcome,
  });

  return { effectiveStage, newEvent };
}

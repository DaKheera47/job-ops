import type { ApplicationStage, StageEvent } from "@shared/types.js";
import { STAGE_LABELS } from "@shared/types.js";

export type LoggableStageValue =
  | "no_change"
  | ApplicationStage
  | "rejected"
  | "withdrawn";

export const LOGGABLE_STAGE_OPTIONS: Array<{
  label: string;
  value: LoggableStageValue;
}> = [
  { label: "No Stage Change (Keep current status)", value: "no_change" },
  { label: STAGE_LABELS.applied, value: "applied" },
  { label: STAGE_LABELS.recruiter_screen, value: "recruiter_screen" },
  { label: STAGE_LABELS.assessment, value: "assessment" },
  { label: STAGE_LABELS.hiring_manager_screen, value: "hiring_manager_screen" },
  { label: STAGE_LABELS.technical_interview, value: "technical_interview" },
  { label: STAGE_LABELS.onsite, value: "onsite" },
  { label: STAGE_LABELS.offer, value: "offer" },
  { label: "Rejected", value: "rejected" },
  { label: "Withdrawn", value: "withdrawn" },
  { label: STAGE_LABELS.closed, value: "closed" },
];

export type SankeyStageValue =
  | Exclude<LoggableStageValue, "no_change">
  | "no_response";

export const getSankeyStageLabel = (stage: SankeyStageValue): string => {
  if (stage === "rejected") return "Rejected";
  if (stage === "withdrawn") return "Withdrawn";
  if (stage === "no_response") return "No Response";
  return STAGE_LABELS[stage];
};

export const getSankeyStageFromEvent = (
  event: StageEvent,
): SankeyStageValue => {
  if (event.toStage === "closed") {
    if (event.outcome === "rejected") return "rejected";
    if (event.outcome === "withdrawn") return "withdrawn";
    if (event.outcome === "no_response" || event.outcome === "ghosted") {
      return "no_response";
    }
  }
  return event.toStage;
};
